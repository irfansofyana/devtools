function libraryItemContentKey(item) {
    return JSON.stringify(item.elements);
}

export async function stabilizeImportedLibraryItems(file, importedItems) {
    const source = JSON.parse(await file.text());
    if (!Array.isArray(source.library) || Array.isArray(source.libraryItems)) return importedItems;

    const digestBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
    const digest = [...digestBytes].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
    return importedItems.map((item, index) => ({
        ...item,
        id: `imported-${digest}-${index}`,
    }));
}

export function mergeImportedLibraryItems(existingItems, importedItems) {
    const merged = [...existingItems];
    const existingIds = new Set(existingItems.map(({ id }) => id));
    const existingContent = new Set(existingItems.map(libraryItemContentKey));

    for (const item of importedItems) {
        const contentKey = libraryItemContentKey(item);
        if (existingIds.has(item.id) || existingContent.has(contentKey)) continue;
        merged.push(item);
        existingIds.add(item.id);
        existingContent.add(contentKey);
    }

    return merged;
}
