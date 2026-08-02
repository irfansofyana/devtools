(function attachIPLookupService(root) {
    const API_URL = 'https://api.ipapi.is';

    function optionalBoolean(value) {
        return typeof value === 'boolean' ? value : null;
    }

    function normalize(data) {
        if (!data || data.error) {
            throw new Error(data?.message || 'IP lookup failed');
        }

        const location = data.location || {};
        const company = data.company || {};
        const asn = data.asn || {};

        return {
            query: data.ip,
            country: location.country || 'Not reported',
            countryCode: location.country_code || '',
            regionName: location.state || 'Not reported',
            city: location.city || 'Not reported',
            lat: location.latitude ?? null,
            lon: location.longitude ?? null,
            timezone: location.timezone || 'Not reported',
            isp: company.name || asn.org || 'Not reported',
            org: asn.org || company.name || 'Not reported',
            as: asn.asn ? `AS${asn.asn}` : 'Not reported',
            proxy: optionalBoolean(data.is_proxy),
            vpn: optionalBoolean(data.is_vpn),
            hosting: optionalBoolean(data.is_datacenter),
        };
    }

    async function lookup(ip = '', fetchImpl = fetch) {
        const query = ip ? `?q=${encodeURIComponent(ip)}` : '';
        const response = await fetchImpl(`${API_URL}/${query}`);

        if (!response.ok) {
            throw new Error(`IP lookup service returned HTTP ${response.status}`);
        }

        return normalize(await response.json());
    }

    root.IPLookupService = Object.freeze({ lookup, normalize });
})(globalThis);
