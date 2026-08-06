/**
 * Image attachment example.
 *
 * Attaches a base64 image to a prompt via `images`, so the model can see it.
 * `run()` and `session.stream()` both accept the same `images` option.
 *
 * Usage:
 *   npx tsx examples/node/image-attachment.ts
 */

import { run } from '@factory/droid-sdk/node';

/** A 120x120 PNG: one purple square centered on white. */
const PURPLE_SQUARE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAIAAAC2BqGFAAAAzElEQVR42u3QAQ0A' +
  'MAgEsZeOvLkCFyQLvZyCprVSEIAGLdCgQQs0aIEGDVqgQQs0aNACDVqgQYMWaNAC' +
  'DRq0QIMW6GPQlffdoEGDBg0aNGjQoEGDBg0aNGjQoEGDBg0aNGjQoEGDBg0aNGjQ' +
  'oEGDBg0aNGjQoEGDBg0aNGjQoEGDBg0aNGjQoEGDBg0aNGjQoEGDBg0aNGjQoEGD' +
  'Bg0aNGjQoEGDFmjQAg0atECDFmjQoAUatECDBi3QoAUaNGiBBi3QoEELNGiBBn2g' +
  'AU2hHmFuN1AZAAAAAElFTkSuQmCC';

const { text } = await run(
  'What single shape and color is in this image? Answer in five words or fewer.',
  {
    images: [
      {
        type: 'base64',
        data: PURPLE_SQUARE_PNG,
        mediaType: 'image/png',
      },
    ],
  }
);

console.log(text);
