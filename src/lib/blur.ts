export async function calculateBlurScore(file: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      
      if (!ctx) {
        return resolve(100); // Fallback if no canvas 2d context
      }

      // Resize for performance
      const maxDim = 300;
      let width = img.width;
      let height = img.height;
      if (width > height && width > maxDim) {
        height *= maxDim / width;
        width = maxDim;
      } else if (height > maxDim) {
        width *= maxDim / height;
        height = maxDim;
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      
      // Convert to grayscale
      const grays = new Float32Array(width * height);
      for (let i = 0; i < data.length; i += 4) {
        // Luminance
        grays[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }

      // Compute Laplacian variance
      let laplacianSum = 0;
      let laplacianSqSum = 0;
      let count = 0;

      // Laplacian kernel:
      //  0  1  0
      //  1 -4  1
      //  0  1  0
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = y * width + x;
          const val =
            -4 * grays[idx] +
            grays[idx - width] +
            grays[idx + width] +
            grays[idx - 1] +
            grays[idx + 1];

          laplacianSum += val;
          laplacianSqSum += val * val;
          count++;
        }
      }

      if (count === 0) return resolve(100);

      const mean = laplacianSum / count;
      const variance = (laplacianSqSum / count) - (mean * mean);
      
      resolve(variance);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(100); // Fallback on error
    };

    img.src = url;
  });
}
