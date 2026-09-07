import * as pdfjsLib from "pdfjs-dist";

import pdfjsWorker from
  "pdfjs-dist/build/pdf.worker.min.mjs?url";

import {
  recognizeImage
} from "./ocr.js";


pdfjsLib.GlobalWorkerOptions.workerSrc =
  pdfjsWorker;


/*
|--------------------------------------------------------------------------
| Configuration
|--------------------------------------------------------------------------
*/

const DEFAULT_RENDER_SCALE = 2;

const OCR_TEXT_THRESHOLD = 20;


/*
|--------------------------------------------------------------------------
| Utility
|--------------------------------------------------------------------------
*/

function cleanText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}


function getTextItemPosition(item) {
  const transform =
    Array.isArray(item.transform)
      ? item.transform
      : [1, 0, 0, 1, 0, 0];

  return {
    x: Number(transform[4] || 0),
    y: Number(transform[5] || 0),
    width: Number(item.width || 0),
    height: Number(item.height || 0),

    transform: transform.map(
      value => Number(value || 0)
    )
  };
}


function groupTextItemsIntoLines(
  items
) {
  const lines = [];

  const tolerance = 4;

  for (const item of items) {

    const text =
      cleanText(item.str);

    if (!text) {
      continue;
    }

    const position =
      getTextItemPosition(item);

    let line =
      lines.find(
        existing =>
          Math.abs(
            existing.y -
            position.y
          ) <= tolerance
      );

    if (!line) {
      line = {
        y: position.y,
        items: []
      };

      lines.push(line);
    }

    line.items.push({
      text,
      ...position
    });
  }

  lines.sort(
    (a, b) =>
      b.y - a.y
  );

  return lines.map(
    line => {

      line.items.sort(
        (a, b) =>
          a.x - b.x
      );

      return {
        text:
          line.items
            .map(
              item =>
                item.text
            )
            .join(" ")
            .replace(
              /\s+/g,
              " "
            )
            .trim(),

        x:
          Math.min(
            ...line.items.map(
              item => item.x
            )
          ),

        y:
          line.y,

        width:
          Math.max(
            ...line.items.map(
              item =>
                item.x +
                item.width
            )
          ) -
          Math.min(
            ...line.items.map(
              item => item.x
            )
          ),

        height:
          Math.max(
            ...line.items.map(
              item =>
                item.height
            )
          )
      };
    }
  );
}


/*
|--------------------------------------------------------------------------
| Extract native text
|--------------------------------------------------------------------------
*/

async function extractNativeText(
  page
) {
  const content =
    await page.getTextContent({
      normalizeWhitespace: false,
      disableCombineTextItems: false
    });

  const rawItems =
    content.items
      .filter(
        item =>
          typeof item.str === "string"
      );

  const items =
    rawItems.map(
      item => {

        const position =
          getTextItemPosition(
            item
          );

        return {
          text:
            item.str,

          x:
            position.x,

          y:
            position.y,

          width:
            position.width,

          height:
            position.height,

          transform:
            position.transform,

          fontName:
            item.fontName || null,

          hasEOL:
            Boolean(
              item.hasEOL
            )
        };
      }
    );

  const cleanedItems =
    items.filter(
      item =>
        cleanText(item.text)
    );

  const lines =
    groupTextItemsIntoLines(
      cleanedItems
    );

  const text =
    lines
      .map(
        line =>
          line.text
      )
      .join("\n")
      .trim();

  return {
    text,
    items: cleanedItems,
    lines
  };
}


/*
|--------------------------------------------------------------------------
| Extract annotations / links
|--------------------------------------------------------------------------
*/

async function extractAnnotations(
  page
) {
  let annotations = [];

  try {

    annotations =
      await page.getAnnotations({
        intent: "display"
      });

  } catch {
    annotations = [];
  }

  return annotations.map(
    annotation => ({
      subtype:
        annotation.subtype ||
        null,

      annotationType:
        annotation.annotationType ||
        null,

      rect:
        Array.isArray(
          annotation.rect
        )
          ? annotation.rect
          : null,

      contents:
        annotation.contents ||
        null,

      contentsObj:
        annotation.contentsObj ||
        null,

      title:
        annotation.title ||
        null,

      url:
        annotation.url ||
        null,

      unsafeUrl:
        annotation.unsafeUrl ||
        null,

      dest:
        annotation.dest ||
        null,

      fieldName:
        annotation.fieldName ||
        null,

      fieldValue:
        annotation.fieldValue ||
        null,

      alternativeText:
        annotation.alternativeText ||
        null
    })
  );
}


/*
|--------------------------------------------------------------------------
| Detect PDF image / drawing operators
|--------------------------------------------------------------------------
*/

async function inspectOperators(
  page
) {
  const result = {
    image_count: 0,
    image_objects: [],
    operator_count: 0
  };

  try {

    const operatorList =
      await page.getOperatorList();

    result.operator_count =
      operatorList.fnArray.length;

    const imageOps = new Set([
      pdfjsLib.OPS.paintImageMaskXObject,
      pdfjsLib.OPS.paintImageMaskXObjectRepeat,
      pdfjsLib.OPS.paintImageMaskXObjectGroup,
      pdfjsLib.OPS.paintImageXObject,
      pdfjsLib.OPS.paintInlineImageXObject,
      pdfjsLib.OPS.paintInlineImageXObjectGroup
    ]);

    for (
      let i = 0;
      i <
      operatorList.fnArray.length;
      i++
    ) {

      const operator =
        operatorList.fnArray[i];

      if (
        imageOps.has(operator)
      ) {

        result.image_count++;

        result.image_objects.push({
          operator,
          index: i
        });
      }
    }

  } catch (error) {

    result.error =
      error instanceof Error
        ? error.message
        : String(error);
  }

  return result;
}


/*
|--------------------------------------------------------------------------
| Render page
|--------------------------------------------------------------------------
*/

async function renderPage(
  page,
  scale = DEFAULT_RENDER_SCALE
) {
  const viewport =
    page.getViewport({
      scale
    });

  const canvas =
    document.createElement(
      "canvas"
    );

  const context =
    canvas.getContext(
      "2d",
      {
        alpha: false
      }
    );

  if (!context) {
    throw new Error(
      "Unable to create canvas context."
    );
  }

  canvas.width =
    Math.ceil(
      viewport.width
    );

  canvas.height =
    Math.ceil(
      viewport.height
    );

  await page.render({
    canvasContext:
      context,

    viewport
  }).promise;

  return {
    canvas,
    viewport
  };
}


/*
|--------------------------------------------------------------------------
| Determine whether OCR is useful
|--------------------------------------------------------------------------
*/

function shouldOCR(
  nativeText,
  operatorInfo
) {
  const text =
    cleanText(nativeText);

  if (
    text.length >=
    OCR_TEXT_THRESHOLD
  ) {
    return false;
  }

  if (
    operatorInfo.image_count > 0
  ) {
    return true;
  }

  return true;
}


/*
|--------------------------------------------------------------------------
| Extract one PDF page
|--------------------------------------------------------------------------
*/

export async function extractPage(
  pdf,
  pageNumber,
  options = {}
) {
  const {
    language = "eng",
    renderScale =
      DEFAULT_RENDER_SCALE,

    onOCRProgress = null
  } = options;


  const page =
    await pdf.getPage(
      pageNumber
    );


  const view =
    page.view || [];

  const pageWidth =
    Number(
      view[2] || 0
    );

  const pageHeight =
    Number(
      view[3] || 0
    );


  /*
   * Native text
   */

  const native =
    await extractNativeText(
      page
    );


  /*
   * Annotations
   */

  const annotations =
    await extractAnnotations(
      page
    );


  /*
   * Image operators
   */

  const operators =
    await inspectOperators(
      page
    );


  /*
   * OCR
   */

  let ocr = {
    used: false,
    text: "",
    confidence: null
  };


  if (
    shouldOCR(
      native.text,
      operators
    )
  ) {

    const rendered =
      await renderPage(
        page,
        renderScale
      );


    const result =
      await recognizeImage(
        rendered.canvas,
        language,
        logger => {

          if (
            typeof onOCRProgress ===
            "function"
          ) {

            onOCRProgress(
              logger
            );
          }
        }
      );


    ocr = {
      used: true,

      text:
        cleanText(
          result.text
        ),

      confidence:
        result.confidence
    };
  }


  /*
   * Final page text
   *
   * Native text remains authoritative
   * when available. OCR is preserved
   * separately so nothing is silently
   * overwritten.
   */

  const finalText =
    native.text ||
    ocr.text ||
    "";


  return {

    page_number:
      pageNumber,

    width:
      pageWidth,

    height:
      pageHeight,


    rotation:
      Number(
        page.rotate || 0
      ),


    text:
      finalText,


    native_text:
      native.text,


    ocr_text:
      ocr.text,


    extraction_method:
      native.text &&
      ocr.used
        ? "native+ocr"
        : native.text
          ? "native"
          : ocr.used
            ? "ocr"
            : "none",


    ocr_used:
      ocr.used,


    ocr_confidence:
      ocr.confidence,


    text_items:
      native.items,


    text_lines:
      native.lines,


    annotations,


    images:
      operators.image_objects,


    image_count:
      operators.image_count,


    operator_count:
      operators.operator_count
  };
}


/*
|--------------------------------------------------------------------------
| Load PDF
|--------------------------------------------------------------------------
*/

export async function loadPDF(
  arrayBuffer
) {
  const loadingTask =
    pdfjsLib.getDocument({
      data:
        new Uint8Array(
          arrayBuffer
        )
    });

  return await loadingTask.promise;
}


/*
|--------------------------------------------------------------------------
| Extract complete PDF
|--------------------------------------------------------------------------
*/

export async function extractPDF(
  file,
  options = {}
) {
  const {
    language = "eng",

    renderScale =
      DEFAULT_RENDER_SCALE,

    onProgress = null,

    onOCRProgress = null
  } = options;


  const arrayBuffer =
    await file.arrayBuffer();


  const pdf =
    await loadPDF(
      arrayBuffer
    );


  const metadataResult =
    await pdf.getMetadata()
      .catch(
        () => ({
          info: {},
          metadata: null
        })
      );


  const info =
    metadataResult?.info ||
    {};


  const pages = [];


  for (
    let pageNumber = 1;
    pageNumber <=
    pdf.numPages;
    pageNumber++
  ) {

    if (
      typeof onProgress ===
      "function"
    ) {

      onProgress({
        page:
          pageNumber,

        totalPages:
          pdf.numPages,

        phase:
          "extracting"
      });
    }


    const pageData =
      await extractPage(
        pdf,
        pageNumber,
        {
          language,
          renderScale,
          onOCRProgress
        }
      );


    pages.push(
      pageData
    );


    if (
      typeof onProgress ===
      "function"
    ) {

      onProgress({
        page:
          pageNumber,

        totalPages:
          pdf.numPages,

        phase:
          "complete",

        pageData
      });
    }
  }


  const totalNativeCharacters =
    pages.reduce(
      (sum, page) =>
        sum +
        page.native_text.length,
      0
    );


  const totalOCRCharacters =
    pages.reduce(
      (sum, page) =>
        sum +
        page.ocr_text.length,
      0
    );


  const totalImages =
    pages.reduce(
      (sum, page) =>
        sum +
        page.image_count,
      0
    );


  const totalAnnotations =
    pages.reduce(
      (sum, page) =>
        sum +
        page.annotations.length,
      0
    );


  const ocrPages =
    pages.filter(
      page =>
        page.ocr_used
    ).length;


  return {

    schema_version:
      "1.0.0",


    file: {

      name:
        file.name,

      type:
        file.type ||
        "application/pdf",

      size:
        file.size,

      last_modified:
        file.lastModified
          ? new Date(
              file.lastModified
            ).toISOString()
          : null,

      pages:
        pdf.numPages
    },


    metadata: {

      title:
        info.Title ||
        null,

      author:
        info.Author ||
        null,

      subject:
        info.Subject ||
        null,

      keywords:
        info.Keywords ||
        null,

      creator:
        info.Creator ||
        null,

      producer:
        info.Producer ||
        null,

      creation_date:
        info.CreationDate ||
        null,

      modification_date:
        info.ModDate ||
        null,

      pdf_version:
        info.PDFFormatVersion ||
        null,

      trapped:
        info.Trapped ||
        null
    },


    extraction: {

      method:
        ocrPages > 0
          ? totalNativeCharacters > 0
            ? "native+ocr"
            : "ocr"
          : "native",

      ocr_used:
        ocrPages > 0,

      ocr_pages:
        ocrPages,

      language,

      render_scale:
        renderScale,

      native_character_count:
        totalNativeCharacters,

      ocr_character_count:
        totalOCRCharacters,

      image_count:
        totalImages,

      annotation_count:
        totalAnnotations
    },


    pages
  };
}