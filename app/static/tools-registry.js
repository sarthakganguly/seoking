/**
 * SEO King - Standalone Tools Registry & Declarative Serializer
 * Defines all 19 standalone tools, their schema properties, field definitions, and generic form serialization rules.
 */

const TOOLS_REGISTRY = [
    { 
        id: "robots", 
        name: "Robots.txt Creator", 
        desc: "Generate valid robots rules according to Google Search Central guidelines.", 
        action: "Create", 
        endpoint: "/api/tools/robots-txt-creator", 
        fields: [
            { id: "r-crawlers", name: "target_crawlers", label: "Target Crawlers (User-Agents)", type: "list", defaultItems: ["*", "Googlebot", "Googlebot-Image", "Google-Extended"], presets: ["*", "Googlebot", "Googlebot-Image", "Googlebot-News", "Googlebot-Video", "Storebot-Google", "Google-Extended", "Bingbot", "GPTBot"], placeholder: "e.g., Googlebot" },
            { id: "r-allow", name: "allowed_directories", label: "Allow Paths", type: "list", placeholder: "e.g., /public/" },
            { id: "r-disallow", name: "urls_to_disallow", label: "Disallow Paths", type: "list", placeholder: "e.g., /admin/" },
            { id: "r-sitemap", name: "sitemap_url", label: "Sitemap URL (Optional)", type: "url", placeholder: "example.com/sitemap.xml" }
        ] 
    },
    { 
        id: "robotstester", 
        name: "Robots.txt Rule & Path Tester", 
        desc: "Tests specific URL paths against robots.txt rules to verify ALLOWED vs BLOCKED status based on Google Search Central precedence rules.", 
        action: "Test Path Rule", 
        endpoint: "/api/tools/robots-path-tester", 
        fields: [
            { id: "rt-txt", name: "robots_txt", label: "Robots.txt Content", type: "textarea", placeholder: "User-agent: *\nDisallow: /admin/\nAllow: /admin/public/" },
            { id: "rt-path", name: "test_path", label: "URL Path to Test", type: "text", placeholder: "/admin/public/page" },
            { 
                id: "rt-ua", 
                name: "user_agent", 
                label: "Target User-Agent Crawler", 
                type: "select", 
                options: [
                    { value: "Googlebot", label: "Googlebot (Search)" },
                    { value: "Googlebot-Image", label: "Googlebot-Image" },
                    { value: "Google-Extended", label: "Google-Extended (AI)" },
                    { value: "Bingbot", label: "Bingbot" },
                    { value: "*", label: "* (All Bots)" }
                ] 
            }
        ] 
    },
    { 
        id: "schema", 
        name: "Schema Markup Generator", 
        desc: "Create JSON-LD schemas matching Google guidelines.", 
        action: "Generate", 
        endpoint: "/api/tools/schema-generator", 
        fields: [{ id: "s-builder", type: "schema_builder" }],
        buildPayload: function() {
            const schemaType = document.getElementById('s-builder-type').value;
            const params = collectSchemaData('s-builder');
            delete params['@context'];
            delete params['@type'];
            return { schema_type: schemaType, parameters: params };
        }
    },
    { 
        id: "sitemap", 
        name: "XML Sitemap & Media Extension Builder", 
        desc: "Build XML sitemaps by crawling a domain automatically or specifying custom URLs.", 
        action: "Build Sitemap", 
        endpoint: "/api/tools/sitemap-builder", 
        fields: [
            { 
                id: "sm-mode", 
                name: "mode", 
                label: "Generation Mode", 
                type: "select", 
                options: [
                    { value: "crawl", label: "Crawl Domain Automatically" },
                    { value: "manual", label: "Manual URL List" }
                ]
            },
            { id: "sm-domain", name: "domain", label: "Domain to Crawl (e.g. labnol.org)", type: "text", placeholder: "https://labnol.org" },
            { 
                id: "sm-depth", 
                name: "max_depth", 
                label: "Crawl Depth", 
                type: "select", 
                options: [
                    { value: "1", label: "Depth 1 (Homepage & Direct Links)" },
                    { value: "2", label: "Depth 2 (Standard Site Crawl)" },
                    { value: "3", label: "Depth 3 (Deep Site Crawl)" }
                ]
            },
            { 
                id: "sm-type", 
                name: "sitemap_type", 
                label: "Sitemap Extension Type", 
                type: "select", 
                options: [
                    { value: "standard", label: "Standard XML Sitemap (0.9)" },
                    { value: "image", label: "Image Extension Sitemap (google.com/schemas/sitemap-image/1.1)" },
                    { value: "video", label: "Video Extension Sitemap (google.com/schemas/sitemap-video/1.1)" },
                    { value: "news", label: "News Extension Sitemap (google.com/schemas/sitemap-news/0.9)" }
                ]
            },
            { id: "sm-urls", name: "urls", label: "Manual URLs (for Manual Mode)", type: "list", defaultItems: [], placeholder: "e.g. https://example.com/page" },
            { 
                id: "sm-changefreq", 
                name: "default_changefreq", 
                label: "Change Frequency (Optional)", 
                type: "select", 
                options: [
                    { value: "", label: "None (Default)" },
                    { value: "daily", label: "daily" },
                    { value: "weekly", label: "weekly" },
                    { value: "monthly", label: "monthly" },
                    { value: "always", label: "always" },
                    { value: "hourly", label: "hourly" },
                    { value: "yearly", label: "yearly" }
                ]
            },
            { 
                id: "sm-priority", 
                name: "default_priority", 
                label: "Priority (Optional)", 
                type: "select", 
                options: [
                    { value: "", label: "None (Default)" },
                    { value: "1.0", label: "1.0 (Highest)" },
                    { value: "0.8", label: "0.8 (High)" },
                    { value: "0.5", label: "0.5 (Medium)" },
                    { value: "0.3", label: "0.3 (Low)" }
                ]
            }
        ] 
    },
    { 
        id: "hreflang", 
        name: "Hreflang Tag Checker", 
        desc: "Generate hreflang link tags.", 
        action: "Check", 
        endpoint: "/api/tools/hreflang-mapper", 
        fields: [{ id: "h-map", label: "URL to Lang Mappings", type: "keyvalue", keyPlaceholder: "URL", valPlaceholder: "Lang (e.g. en-US)" }],
        buildPayload: function() {
            const mappingsObj = JSON.parse(document.getElementById('h-map').value || '{}');
            return { mappings: Object.keys(mappingsObj).map(k => ({ url: k, lang: mappingsObj[k] })) };
        }
    },
    { 
        id: "redirect", 
        name: "Redirect Tracer", 
        desc: "Trace 301/302 redirect hops.", 
        action: "Trace", 
        endpoint: "/api/tools/redirect-tracer", 
        fields: [{ id: "rd-url", name: "url", label: "Target URL", type: "url" }] 
    },
    { 
        id: "eeat", 
        name: "E-E-A-T Assessor", 
        desc: "Score content quality based on inputs.", 
        action: "Assess", 
        endpoint: "/api/tools/eeat-assessment", 
        fields: [{
            id: "e-answers", 
            name: "answers", 
            label: "Quality Checklist", 
            type: "checkboxes", 
            questions: [
                "Does the content provide original information, reporting, research, or analysis?",
                "Does the content provide a substantial, complete, or comprehensive description of the topic?",
                "Does the content provide insightful analysis or interesting information that is beyond the obvious?",
                "Does the content avoid simply copying or rewriting other sources?",
                "Does the main heading or page title provide a descriptive, helpful summary of the content?",
                "Does the main heading or page title avoid exaggerating or being shocking in nature?",
                "Is this the sort of page you'd want to bookmark, share with a friend, or recommend?",
                "Would you expect to see this content in or referenced by a printed magazine, encyclopedia, or book?",
                "Does the content provide substantial value when compared to other pages in search results?",
                "Is the content free of spelling or stylistic issues?",
                "Is the content produced well, and doesn't appear sloppy or hastily produced?",
                "Does the content present information in a way that makes you want to trust it?",
                "Is this content written or reviewed by an expert or enthusiast who demonstrably knows the topic well?"
            ]
        }] 
    },
    { 
        id: "eeatscanner", 
        name: "E-E-A-T Live Page Scanner", 
        desc: "Audits live HTML and metadata for E-E-A-T expertise signals, publish dates, outbound citations, and organizational trust pages.", 
        action: "Scan Live Page E-E-A-T", 
        endpoint: "/api/tools/eeat-page-scanner", 
        fields: [{ id: "es-url", name: "url", label: "Target Webpage URL", type: "url", placeholder: "example.com/blog/article" }] 
    },
    { 
        id: "discover", 
        name: "Google Discover Validator & Meta Builder", 
        desc: "Audits pages for Google Discover eligibility according to Google Search Central. Validates hero image requirements (min 1200px width) and required meta tags (max-image-preview:large, og:image, og:image:width, og:image:height).", 
        action: "Validate & Generate Meta Tags", 
        endpoint: "/api/tools/discover-validator", 
        fields: [{ id: "d-url", name: "url", label: "Target Article URL", type: "url", placeholder: "example.com/article" }] 
    },
    { 
        id: "safesearch", 
        name: "SafeSearch Classifier", 
        desc: "Generate SafeSearch adult tags.", 
        action: "Classify", 
        endpoint: "/api/tools/safesearch-classifier", 
        fields: [{ id: "ss-dirs", name: "directories", label: "Adult Directories", type: "list", placeholder: "e.g., /adult/" }] 
    },
    { 
        id: "urlauditor", 
        name: "URL Path Auditor", 
        desc: "Audit URL path cleanliness.", 
        action: "Audit", 
        endpoint: "/api/tools/url-auditor", 
        fields: [{ id: "ua-domain", name: "domain", label: "Domain to audit", type: "url" }] 
    },
    { 
        id: "gsc", 
        name: "GSC Drop Diagnoser", 
        desc: "Diagnose traffic drop reasons.", 
        action: "Diagnose", 
        endpoint: "/api/tools/gsc-diagnoser", 
        fields: [
            { id: "gsc-prop", name: "property", label: "GSC Property", type: "url", placeholder: "https://example.com" },
            { id: "gsc-dates", name: "dates", label: "Date Range", type: "text", placeholder: "YYYY-MM-DD to YYYY-MM-DD" }
        ] 
    },
    { 
        id: "datecheck", 
        name: "Date Consistency Checker", 
        desc: "Compare URL date vs Meta date.", 
        action: "Check", 
        endpoint: "/api/tools/date-consistency", 
        fields: [{ id: "dc-url", name: "url", label: "Target URL", type: "url" }] 
    },
    { 
        id: "spadiff", 
        name: "SPA DOM Diffing", 
        desc: "Compare Raw HTML vs JS render.", 
        action: "Analyze", 
        endpoint: "/api/tools/spa-lazy-load", 
        fields: [{ id: "spa-url", name: "url", label: "Target URL", type: "url" }] 
    },
    { 
        id: "pdfaccess", 
        name: "PDF Accessibility", 
        desc: "Check X-Robots-Tag for PDFs.", 
        action: "Check", 
        endpoint: "/api/tools/non-html-accessibility", 
        fields: [{ id: "pdf-url", name: "url", label: "PDF URL", type: "url" }] 
    },
    { 
        id: "review", 
        name: "Product Review Grader", 
        desc: "Grade affiliate review pages.", 
        action: "Grade", 
        endpoint: "/api/tools/product-review-grader", 
        fields: [{ id: "pr-url", name: "url", label: "Target URL", type: "url" }] 
    },
    { 
        id: "paywall", 
        name: "Paywall Auditor", 
        desc: "Verify isAccessibleForFree schema.", 
        action: "Verify", 
        endpoint: "/api/tools/paywall-auditor", 
        fields: [{ id: "pw-url", name: "url", label: "Target URL", type: "url" }] 
    },
    { 
        id: "snippet", 
        name: "Snippet Scanner", 
        desc: "Scan max-snippet robot tags.", 
        action: "Scan", 
        endpoint: "/api/tools/snippet-scanner", 
        fields: [{ id: "sn-url", name: "url", label: "Target URL", type: "url" }] 
    },
    { 
        id: "server", 
        name: "Server Maintenance", 
        desc: "Validate 503 Retry-After headers.", 
        action: "Validate", 
        endpoint: "/api/tools/server-maintenance", 
        fields: [{ id: "sm-domain", name: "domain", label: "Target Domain", type: "url" }] 
    },
    { 
        id: "indexing", 
        name: "Indexing API Advisor", 
        desc: "Validate GCP service account JSON.", 
        action: "Validate", 
        endpoint: "/api/tools/indexing-api-advisor", 
        fields: [{ id: "ia-json", name: "credentials_json", label: "Credentials JSON", type: "textarea", placeholder: "{...}" }] 
    },
    { 
        id: "localseo", 
        name: "Local SEO Auditor", 
        desc: "Check NAP alignment in HTML.", 
        action: "Audit", 
        endpoint: "/api/tools/local-seo-auditor", 
        fields: [
            { id: "ls-url", name: "url", label: "URL", type: "url" },
            { id: "ls-name", name: "name", label: "Business Name", type: "text" },
            { id: "ls-address", name: "address", label: "Address", type: "text" },
            { id: "ls-phone", name: "phone", label: "Phone", type: "text" }
        ] 
    },
    { 
        id: "redirectgen", 
        name: "Server-Side Redirect Code Generator", 
        desc: "Generate valid server-side redirect configuration code for Apache and NGINX.", 
        action: "Generate Redirect Code", 
        endpoint: "/api/tools/redirect-generator", 
        fields: [
            { id: "rg-source", name: "source_url", label: "Source URL Path (e.g., /old-page)", type: "text", placeholder: "/old-page" },
            { id: "rg-dest", name: "destination_url", label: "Destination URL (e.g., https://example.com/new-page)", type: "url", placeholder: "https://example.com/new-page" },
            { 
                id: "rg-type", 
                name: "redirect_type", 
                label: "Redirect Type", 
                type: "select", 
                options: [
                    { value: "301", label: "301 Permanent Redirect" },
                    { value: "302", label: "302 Temporary Redirect" }
                ] 
            }
        ] 
    }
];

/**
 * Generic Declarative Form Serializer
 * Extracts input values automatically based on field metadata.
 */
window.serializeToolForm = function(tool) {
    if (typeof tool.buildPayload === 'function') {
        return tool.buildPayload();
    }
    const payload = {};
    tool.fields.forEach(f => {
        const key = f.name || f.id;
        const el = document.getElementById(f.id);
        if (f.type === 'list') {
            const pendingInput = document.getElementById(`${f.id}-input`);
            if (pendingInput && pendingInput.value.trim()) {
                window.addListItem(f.id);
            }
            payload[key] = JSON.parse(el ? el.value : "[]");
        } else if (f.type === 'keyvalue') {
            const pendingKey = document.getElementById(`${f.id}-key`);
            const pendingVal = document.getElementById(`${f.id}-val`);
            if (pendingKey && pendingVal && pendingKey.value.trim() && pendingVal.value.trim()) {
                window.addKeyValueItem(f.id);
            }
            payload[key] = JSON.parse(el ? el.value : "{}");
        } else if (f.type === 'checkboxes') {
            const answers = {};
            f.questions.forEach((q, idx) => {
                const chk = document.getElementById(`${f.id}-chk-${idx}`);
                answers[q] = chk ? chk.checked : false;
            });
            payload[key] = answers;
        } else if (f.type === 'url') {
            const protoEl = document.getElementById(`${f.id}-protocol`);
            if (el && el.value.trim()) {
                const proto = protoEl ? protoEl.value : "";
                let val = el.value.trim();
                val = val.replace(/^https?:\/\//, '');
                payload[key] = proto + val;
            }
        } else if (el) {
            const val = el.value.trim();
            if (val) payload[key] = val;
        }
    });
    return payload;
};
