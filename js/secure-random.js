(function attachSecureRandom(root) {
    const UINT32_RANGE = 0x100000000;

    function randomInt(maximum) {
        if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > UINT32_RANGE) {
            throw new RangeError('maximum must be an integer between 1 and 2^32');
        }

        const rejectionLimit = UINT32_RANGE - (UINT32_RANGE % maximum);
        const value = new Uint32Array(1);

        do {
            crypto.getRandomValues(value);
        } while (value[0] >= rejectionLimit);

        return value[0] % maximum;
    }

    function randomChar(characters) {
        if (typeof characters !== 'string' || characters.length === 0) {
            throw new TypeError('characters must be a non-empty string');
        }

        return characters[randomInt(characters.length)];
    }

    function shuffle(values) {
        const result = [...values];

        for (let index = result.length - 1; index > 0; index -= 1) {
            const swapIndex = randomInt(index + 1);
            [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
        }

        return result;
    }

    root.SecureRandom = Object.freeze({ randomInt, randomChar, shuffle });
})(globalThis);
