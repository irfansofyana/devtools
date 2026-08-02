import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(appRoot, 'node_modules/@excalidraw/excalidraw/dist/prod/fonts');
const destination = path.resolve(appRoot, '../../tools/diagram-workbench/fonts');

await rm(destination, { recursive: true, force: true });
await mkdir(path.dirname(destination), { recursive: true });
await cp(source, destination, { recursive: true });
console.log(`Copied Excalidraw fonts to ${destination}`);
