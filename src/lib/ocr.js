import { createWorker } from "tesseract.js";

let worker = null;
let currentLanguage = null;

export async function getOCRWorker(
  language = "eng",
  logger = null
) {
  if (worker && currentLanguage === language) {
    return worker;
  }

  if (worker) {
    await worker.terminate();
    worker = null;
  }

  worker = await createWorker(
    language,
    1,
    {
      logger
    }
  );

  currentLanguage = language;

  return worker;
}

export async function recognizeImage(
  image,
  language = "eng",
  logger = null
) {
  const ocrWorker =
    await getOCRWorker(
      language,
      logger
    );

  const result =
    await ocrWorker.recognize(
      image
    );

  return {
    text:
      result?.data?.text || "",

    confidence:
      typeof result?.data?.confidence === "number"
        ? result.data.confidence
        : null
  };
}

export async function terminateOCRWorker() {
  if (worker) {
    await worker.terminate();
    worker = null;
    currentLanguage = null;
  }
}