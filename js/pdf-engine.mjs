import {
    degrees,
    PDFDocument,
    PDFName,
    rgb,
    StandardFonts,
} from '../vendor/pdf-lib/1.17.1/pdf-lib.mjs';
import { normalizeHexColor } from './pdf-utils.mjs';

const PDF_LOAD_OPTIONS = { updateMetadata: false };
const MAX_PAGE_COUNT = 2000;
const MAX_IMAGE_COUNT = 500;
const MAX_IMAGE_DIMENSION = 20000;
const MAX_IMAGE_PIXELS = 40000000;

function assertBytes(value, label = 'PDF') {
    if (!(value instanceof Uint8Array) && !(value instanceof ArrayBuffer)) {
        throw new TypeError(`${label} data must be bytes.`);
    }
}

async function loadPdf(bytes) {
    assertBytes(bytes);
    const document = await PDFDocument.load(bytes, PDF_LOAD_OPTIONS);
    if (document.getPageCount() > MAX_PAGE_COUNT) throw new Error(`PDFs are limited to ${MAX_PAGE_COUNT} pages per operation.`);
    return document;
}

export async function mergePdfDocuments(documents) {
    if (!Array.isArray(documents) || documents.length < 2) {
        throw new Error('Choose at least two PDF files to merge.');
    }
    const output = await PDFDocument.create();
    let totalPages = 0;
    for (const bytes of documents) {
        const source = await loadPdf(bytes);
        totalPages += source.getPageCount();
        if (totalPages > MAX_PAGE_COUNT) throw new Error(`Merged PDFs are limited to ${MAX_PAGE_COUNT} pages.`);
        const pages = await output.copyPages(source, source.getPageIndices());
        pages.forEach((page) => output.addPage(page));
    }
    return output.save();
}

export async function extractPdfPages(bytes, pageIndices) {
    if (!Array.isArray(pageIndices) || pageIndices.length === 0) {
        throw new Error('Choose at least one page to extract.');
    }
    const source = await loadPdf(bytes);
    const output = await PDFDocument.create();
    const pages = await output.copyPages(source, pageIndices);
    pages.forEach((page) => output.addPage(page));
    return output.save();
}

export async function organizePdfPages(bytes, pageOrder, rotations = {}) {
    if (!Array.isArray(pageOrder) || pageOrder.length === 0) {
        throw new Error('Keep at least one page in the output PDF.');
    }
    const source = await loadPdf(bytes);
    const output = await PDFDocument.create();
    const pages = await output.copyPages(source, pageOrder);
    pages.forEach((page, outputIndex) => {
        const sourceIndex = pageOrder[outputIndex];
        const adjustment = Number(rotations[sourceIndex] ?? 0);
        if (adjustment % 90 !== 0) throw new Error('Page rotations must use 90-degree increments.');
        const current = page.getRotation().angle;
        page.setRotation(degrees(((current + adjustment) % 360 + 360) % 360));
        output.addPage(page);
    });
    return output.save();
}

export async function cleanPdfMetadata(bytes) {
    const document = await loadPdf(bytes);
    document.catalog.delete(PDFName.of('Metadata'));
    delete document.context.trailerInfo.Info;
    return document.save();
}

export async function stampPdf(bytes, options = {}) {
    const document = await loadPdf(bytes);
    const font = await document.embedFont(StandardFonts.Helvetica);
    const watermarkText = String(options.watermarkText ?? '').trim().slice(0, 120);
    const includePageNumbers = Boolean(options.pageNumbers);
    const opacity = Number(options.opacity ?? 0.2);
    const angle = Number(options.angle ?? 35);
    const requestedFontSize = options.fontSize == null ? null : Number(options.fontSize);
    if (!Number.isFinite(opacity) || opacity < 0.05 || opacity > 1) throw new Error('Opacity must be between 0.05 and 1.');
    if (!Number.isFinite(angle) || angle < -360 || angle > 360) throw new Error('Watermark angle must be between -360 and 360 degrees.');
    if (requestedFontSize != null && (!Number.isFinite(requestedFontSize) || requestedFontSize < 6 || requestedFontSize > 200)) {
        throw new Error('Watermark font size must be between 6 and 200 points.');
    }
    const color = normalizeHexColor(options.color ?? '#6b7280');
    const fill = rgb(color.r, color.g, color.b);

    if (!watermarkText && !includePageNumbers) {
        throw new Error('Enter watermark text or enable page numbers.');
    }
    if (watermarkText) {
        try {
            font.encodeText(watermarkText);
        } catch {
            throw new Error('Watermark text currently supports Latin characters only.');
        }
    }

    document.getPages().forEach((page, index) => {
        const { width, height } = page.getSize();
        if (watermarkText) {
            const fontSize = requestedFontSize ?? Math.min(Math.max(28, Math.min(width, height) / 9), 160);
            const textWidth = font.widthOfTextAtSize(watermarkText, fontSize);
            page.drawText(watermarkText, {
                x: Math.max(18, (width - textWidth * 0.72) / 2),
                y: height / 2,
                size: fontSize,
                font,
                color: fill,
                opacity,
                rotate: degrees(angle),
            });
        }
        if (includePageNumbers) {
            const label = String(index + 1);
            const size = 10;
            page.drawText(label, {
                x: (width - font.widthOfTextAtSize(label, size)) / 2,
                y: 18,
                size,
                font,
                color: fill,
                opacity: Math.max(0.6, opacity),
            });
        }
    });

    return document.save();
}

function imageDimensions(bytes, type) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (type === 'image/png') {
        const signature = [137, 80, 78, 71, 13, 10, 26, 10];
        if (data.length < 24 || !signature.every((value, index) => data[index] === value)) throw new Error('The PNG image is malformed.');
        return { width: view.getUint32(16), height: view.getUint32(20) };
    }
    if (type !== 'image/jpeg' || data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) throw new Error('The JPEG image is malformed.');
    const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    let offset = 2;
    while (offset + 4 <= data.length) {
        while (offset < data.length && data[offset] === 0xff) offset += 1;
        const marker = data[offset++];
        if (marker === 0xd9 || marker === 0xda || offset + 2 > data.length) break;
        const length = view.getUint16(offset);
        if (length < 2 || offset + length > data.length) break;
        if (startOfFrame.has(marker) && length >= 7) {
            return { height: view.getUint16(offset + 3), width: view.getUint16(offset + 5) };
        }
        offset += length;
    }
    throw new Error('The JPEG image has no readable dimensions.');
}

function assertImageLimits(bytes, type) {
    const { width, height } = imageDimensions(bytes, type);
    if (width < 1 || height < 1 || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || width * height > MAX_IMAGE_PIXELS) {
        throw new Error(`Images are limited to ${MAX_IMAGE_DIMENSION} pixels per side and ${MAX_IMAGE_PIXELS} total pixels.`);
    }
}

export async function createPdfFromImages(images, options = {}) {
    if (!Array.isArray(images) || images.length === 0) {
        throw new Error('Choose at least one JPG or PNG image.');
    }
    if (images.length > MAX_IMAGE_COUNT) throw new Error(`Choose no more than ${MAX_IMAGE_COUNT} images at a time.`);
    const output = await PDFDocument.create();
    const pagePreset = options.pageSize ?? 'fit';
    const presets = {
        a4: [595.28, 841.89],
        letter: [612, 792],
    };
    if (!['fit', ...Object.keys(presets)].includes(pagePreset)) throw new Error('Choose a supported page size.');
    const margin = pagePreset === 'fit' ? 0 : Number(options.margin ?? 24);
    if (!Number.isFinite(margin) || margin < 0 || margin > 144) {
        throw new Error('Image margin must be between 0 and 144 points.');
    }

    for (const image of images) {
        assertBytes(image.bytes, 'Image');
        const type = String(image.type ?? '').toLowerCase();
        if (type !== 'image/png' && type !== 'image/jpeg') throw new Error('Only JPG and PNG images are supported.');
        assertImageLimits(image.bytes, type);
        const embedded = type === 'image/png'
            ? await output.embedPng(image.bytes)
            : await output.embedJpg(image.bytes);
        const pageSize = presets[pagePreset] ?? [Math.max(1, embedded.width), Math.max(1, embedded.height)];
        const page = output.addPage(pageSize);
        const scale = Math.min(
            (pageSize[0] - margin * 2) / embedded.width,
            (pageSize[1] - margin * 2) / embedded.height,
            pagePreset === 'fit' ? 1 : Number.POSITIVE_INFINITY,
        );
        const width = embedded.width * scale;
        const height = embedded.height * scale;
        page.drawImage(embedded, {
            x: (pageSize[0] - width) / 2,
            y: (pageSize[1] - height) / 2,
            width,
            height,
        });
    }
    return output.save();
}

export async function getPdfPageCount(bytes) {
    return (await loadPdf(bytes)).getPageCount();
}
