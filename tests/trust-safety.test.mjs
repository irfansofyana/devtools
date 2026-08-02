import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);

function read(path) {
    return readFileSync(new URL(path, root), 'utf8');
}

test('SSL checker builds an authoritative external report URL without fake local results', () => {
    const page = read('tools/ssl-checker.html');
    const source = read('js/ssl-report-link.js');
    const context = { URL };

    vm.runInNewContext(source, context);

    assert.equal(
        context.SSLReportLink.build('example.com'),
        'https://www.ssllabs.com/ssltest/analyze.html?d=example.com'
    );
    assert.throws(() => context.SSLReportLink.build('not a domain'));
    assert.match(page, /Open SSL Labs report/);
    assert.match(page, /target="_blank" rel="noopener"/);
    assert.doesNotMatch(page, /createMockCertificateData|mock data|cert-issuer|cert-serial/i);
});

test('secret sharing describes local URL cleanup without claiming single-use links', () => {
    const page = read('tools/secret-share.html');

    assert.doesNotMatch(page, /burn after reading|link has been burned|URL becomes invalid after first view/i);
    assert.match(page, /Other copies of the link still work/);
    assert.match(page, /history\.replaceState/);
});

test('IP lookup uses an HTTPS service and preserves unavailable risk signals', () => {
    const page = read('tools/ip-lookup.html');
    const source = read('js/ip-lookup-service.js');
    const context = {};

    vm.runInNewContext(source, context);

    const result = context.IPLookupService.normalize({
        ip: '8.8.8.8',
        is_proxy: false,
        is_vpn: true,
        is_datacenter: true,
        location: {
            country: 'United States',
            country_code: 'US',
            state: 'California',
            city: 'Mountain View',
            latitude: 37.3,
            longitude: -121.9,
            timezone: 'America/Los_Angeles',
        },
        company: { name: 'Google LLC' },
        asn: { asn: 15169, org: 'Google LLC' },
    });

    assert.equal(result.query, '8.8.8.8');
    assert.equal(result.as, 'AS15169');
    assert.equal(result.proxy, false);
    assert.equal(result.vpn, true);
    assert.equal(result.hosting, true);
    assert.match(source, /https:\/\/api\.ipapi\.is/);
    assert.doesNotMatch(page, /http:\/\/ip-api\.com/);
});

test('password generation uses unbiased cryptographic randomness', () => {
    const page = read('tools/password-generator.html');
    const source = read('js/secure-random.js');
    const context = { crypto: webcrypto };

    vm.runInNewContext(source, context);

    assert.doesNotMatch(page, /Math\.random/);
    assert.match(source, /crypto\.getRandomValues/);

    for (const maximum of [1, 2, 10, 62, 255]) {
        for (let index = 0; index < 200; index += 1) {
            const value = context.SecureRandom.randomInt(maximum);
            assert.ok(Number.isInteger(value));
            assert.ok(value >= 0 && value < maximum);
        }
    }

    const original = [...'abcdef'];
    const shuffled = context.SecureRandom.shuffle(original);
    assert.deepEqual([...shuffled].sort(), [...original].sort());
    assert.deepEqual(original, [...'abcdef'], 'shuffle should not mutate its input');
});
