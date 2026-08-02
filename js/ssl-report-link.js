(function attachSSLReportLink(root) {
    const REPORT_URL = 'https://www.ssllabs.com/ssltest/analyze.html';
    const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

    function normalize(input) {
        const value = String(input || '').trim();
        if (!value) throw new Error('Enter a domain');

        let hostname;
        try {
            hostname = new URL(value.includes('://') ? value : `https://${value}`).hostname;
        } catch {
            throw new Error('Enter a valid public domain');
        }

        hostname = hostname.toLowerCase().replace(/\.$/, '');
        if (!DOMAIN_PATTERN.test(hostname)) {
            throw new Error('Enter a valid public domain');
        }

        return hostname;
    }

    function build(input) {
        const hostname = normalize(input);
        return `${REPORT_URL}?d=${encodeURIComponent(hostname)}`;
    }

    root.SSLReportLink = Object.freeze({ build, normalize });
})(globalThis);
