import { DataTexture, FileLoader, Loader, SRGBColorSpace } from 'three';

// Decodes 8-bit palettized, RLE-compressed PCX images (the Quake 2 skin format).
export class PCXLoader extends Loader {
  load(url, onLoad, onProgress, onError) {
    const loader = new FileLoader(this.manager);
    loader.setPath(this.path);
    loader.setResponseType('arraybuffer');
    loader.load(url, buffer => {
      try { onLoad(this.parse(buffer)); }
      catch (error) { if (onError) onError(error); else throw error; }
    }, onProgress, onError);
  }

  parse(buffer) {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    if (bytes[0] !== 0x0a || bytes[3] !== 8 || bytes[65] !== 1) throw new Error('PCXLoader: only 8-bit single-plane PCX is supported');
    const width = view.getUint16(8, true) - view.getUint16(4, true) + 1;
    const height = view.getUint16(10, true) - view.getUint16(6, true) + 1;
    const bytesPerLine = view.getUint16(66, true);
    const indices = new Uint8Array(bytesPerLine * height);
    let src = 128;
    for (let dst = 0; dst < indices.length && src < bytes.length;) {
      const byte = bytes[src++];
      if (byte >= 0xc0) indices.fill(bytes[src++], dst, dst += byte & 0x3f);
      else indices[dst++] = byte;
    }

    // The 256-colour palette follows the image data after a 0x0c marker. Some Quake 2 skins omit the
    // marker or carry trailing bytes, so fall back to the last 768 bytes of the file.
    const paletteOffset = bytes[src] === 0x0c && src + 769 <= bytes.length ? src + 1 : bytes.length - 768;
    if (paletteOffset < src) throw new Error('PCXLoader: missing 256-colour palette');

    // Flip rows so the first scanline lands at v = 1, matching image textures.
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = paletteOffset + indices[y * bytesPerLine + x] * 3;
        const o = ((height - 1 - y) * width + x) * 4;
        data[o] = bytes[p]; data[o + 1] = bytes[p + 1]; data[o + 2] = bytes[p + 2]; data[o + 3] = 255;
      }
    }
    const texture = new DataTexture(data, width, height);
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }
}
