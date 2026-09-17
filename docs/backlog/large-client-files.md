# Handle very large client PDFs and photos in the worker

## Description

The worker holds every client file and the finished PDF in memory (pdf-lib), so very large client
PDFs and high-resolution photos drive memory use and PDF size. Add `qpdf` to handle very large
client PDFs and `sharp` to normalise photos (size, orientation, compression) before embedding.
Both are native packages in the worker's image. Measure memory with a worst-case fixture
submission before and after, and set `PDF_CONCURRENCY` and `MEMORY` from the result.
