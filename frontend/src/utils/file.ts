export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        const base64 = result.split(',').pop();
        if (base64) {
          resolve(base64);
          return;
        }
      }

      reject(new Error('Unable to read file contents'));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error('Unknown file reader error'));
    };

    reader.readAsDataURL(file);
  });
}

export function base64ToBlob(base64: string, contentType: string): Blob {
  const decodeWithAtob = () => {
    const binaryString = globalThis.atob(base64);
    const byteNumbers = new Array(binaryString.length);

    for (let i = 0; i < binaryString.length; i += 1) {
      byteNumbers[i] = binaryString.charCodeAt(i);
    }

    return new Uint8Array(byteNumbers);
  };

  const decodeWithBuffer = () => {
    const globalBuffer = globalThis as typeof globalThis & {
      Buffer?: typeof import('buffer').Buffer;
    };
    if (!globalBuffer.Buffer) {
      throw new Error('Buffer is not available in this environment');
    }

    return new Uint8Array(globalBuffer.Buffer.from(base64, 'base64'));
  };

  const bytes =
    typeof globalThis.atob === 'function' ? decodeWithAtob() : decodeWithBuffer();
  return new Blob([bytes], { type: contentType });
}
