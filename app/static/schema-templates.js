window.SCHEMA_TEMPLATES = {
    Article: {
        headline: "",
        image: [""],
        datePublished: "",
        dateModified: "",
        author: [{ "@type": "Person", "name": "", "url": "" }],
        publisher: { "@type": "Organization", "name": "", "logo": { "@type": "ImageObject", "url": "" } }
    },
    BlogPosting: {
        headline: "",
        image: [""],
        datePublished: "",
        dateModified: "",
        author: [{ "@type": "Person", "name": "", "url": "" }],
        publisher: { "@type": "Organization", "name": "", "logo": { "@type": "ImageObject", "url": "" } }
    },
    BreadcrumbList: {
        itemListElement: [{ "@type": "ListItem", "position": 1, "name": "", "item": "" }]
    },
    ClaimReview: {
        claimReviewed: "",
        reviewRating: { "@type": "Rating", "ratingValue": "", "bestRating": "", "worstRating": "", "alternateName": "" },
        author: { "@type": "Organization", "name": "", "url": "" },
        datePublished: "",
        itemReviewed: { "@type": "CreativeWork", "author": { "@type": "Person", "name": "" }, "datePublished": "", "name": "" }
    },
    Course: {
        name: "",
        description: "",
        provider: { "@type": "Organization", "name": "", "sameAs": "" }
    },
    Dataset: {
        name: "",
        description: "",
        creator: { "@type": "Organization", "name": "" },
        license: "",
        distribution: [{ "@type": "DataDownload", "encodingFormat": "CSV", "contentUrl": "" }]
    },
    EmployerAggregateRating: {
        itemReviewed: { "@type": "Organization", "name": "", "sameAs": "" },
        ratingValue: "",
        ratingCount: 0
    },
    Event: {
        name: "",
        startDate: "",
        endDate: "",
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: { "@type": "Place", "name": "", "address": { "@type": "PostalAddress", "streetAddress": "", "addressLocality": "", "postalCode": "", "addressRegion": "", "addressCountry": "" } },
        image: [""],
        description: "",
        offers: { "@type": "Offer", "url": "", "price": "", "priceCurrency": "USD", "availability": "https://schema.org/InStock", "validFrom": "" },
        performer: { "@type": "PerformingGroup", "name": "" },
        organizer: { "@type": "Organization", "name": "", "url": "" }
    },
    FAQPage: {
        mainEntity: [{ "@type": "Question", "name": "", "acceptedAnswer": { "@type": "Answer", "text": "" } }]
    },
    HowTo: {
        name: "",
        description: "",
        image: [""],
        estimatedCost: { "@type": "MonetaryAmount", "currency": "USD", "value": "" },
        totalTime: "PT1H",
        tool: [{ "@type": "HowToTool", "name": "" }],
        supply: [{ "@type": "HowToSupply", "name": "" }],
        step: [{ "@type": "HowToStep", "name": "", "text": "", "image": "", "url": "" }]
    },
    ImageObject: {
        contentUrl: "",
        creator: { "@type": "Person", "name": "" },
        creditText: "",
        copyrightNotice: "",
        license: "",
        acquireLicensePage: ""
    },
    JobPosting: {
        title: "",
        description: "",
        datePosted: "",
        validThrough: "",
        employmentType: "FULL_TIME",
        hiringOrganization: { "@type": "Organization", "name": "", "sameAs": "", "logo": "" },
        jobLocation: { "@type": "Place", "address": { "@type": "PostalAddress", "streetAddress": "", "addressLocality": "", "addressRegion": "", "postalCode": "", "addressCountry": "" } },
        baseSalary: { "@type": "MonetaryAmount", "currency": "USD", "value": { "@type": "QuantitativeValue", "value": 0, "unitText": "YEAR" } }
    },
    LocalBusiness: {
        name: "",
        image: [""],
        "@id": "",
        url: "",
        telephone: "",
        address: { "@type": "PostalAddress", "streetAddress": "", "addressLocality": "", "addressRegion": "", "postalCode": "", "addressCountry": "" },
        geo: { "@type": "GeoCoordinates", "latitude": 0, "longitude": 0 },
        openingHoursSpecification: [{ "@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday", "Tuesday"], "opens": "09:00", "closes": "17:00" }],
        priceRange: "$$"
    },
    Movie: {
        name: "",
        image: [""],
        dateCreated: "",
        director: [{ "@type": "Person", "name": "" }],
        actor: [{ "@type": "Person", "name": "" }]
    },
    NewsArticle: {
        headline: "",
        image: [""],
        datePublished: "",
        dateModified: "",
        author: [{ "@type": "Person", "name": "", "url": "" }],
        publisher: { "@type": "Organization", "name": "", "logo": { "@type": "ImageObject", "url": "" } }
    },
    Organization: {
        name: "",
        url: "",
        logo: "",
        sameAs: [""],
        contactPoint: [{ "@type": "ContactPoint", "telephone": "", "contactType": "customer service" }]
    },
    Person: {
        name: "",
        url: "",
        image: "",
        jobTitle: "",
        worksFor: { "@type": "Organization", "name": "" },
        sameAs: [""]
    },
    Product: {
        name: "",
        image: [""],
        description: "",
        brand: { "@type": "Brand", "name": "" },
        sku: "",
        gtin13: "",
        offers: { "@type": "Offer", "url": "", "priceCurrency": "USD", "price": "", "itemCondition": "https://schema.org/NewCondition", "availability": "https://schema.org/InStock" },
        aggregateRating: { "@type": "AggregateRating", "ratingValue": "", "reviewCount": "" },
        review: [{ "@type": "Review", "reviewRating": { "@type": "Rating", "ratingValue": "", "bestRating": "" }, "author": { "@type": "Person", "name": "" } }]
    },
    ProfilePage: {
        mainEntity: { "@type": "Person", "name": "", "alternateName": "", "identifier": "", "interactionStatistic": [{ "@type": "InteractionCounter", "interactionType": "https://schema.org/FollowAction", "userInteractionCount": 0 }] }
    },
    QAPage: {
        mainEntity: { "@type": "Question", "name": "", "text": "", "answerCount": 1, "upvoteCount": 0, "dateCreated": "", "author": { "@type": "Person", "name": "" }, "acceptedAnswer": { "@type": "Answer", "text": "", "upvoteCount": 0, "url": "", "dateCreated": "", "author": { "@type": "Person", "name": "" } } }
    },
    Recipe: {
        name: "",
        image: [""],
        author: { "@type": "Person", "name": "" },
        datePublished: "",
        description: "",
        prepTime: "PT20M",
        cookTime: "PT30M",
        totalTime: "PT50M",
        recipeYield: "4 servings",
        recipeCategory: "Dessert",
        recipeCuisine: "American",
        nutrition: { "@type": "NutritionInformation", "calories": "250 calories" },
        recipeIngredient: ["", ""],
        recipeInstructions: [{ "@type": "HowToStep", "name": "", "text": "", "url": "", "image": "" }],
        video: { "@type": "VideoObject", "name": "", "description": "", "thumbnailUrl": [""], "contentUrl": "", "embedUrl": "", "uploadDate": "", "duration": "PT1M", "expires": "" }
    },
    Review: {
        itemReviewed: { "@type": "Restaurant", "image": "", "name": "", "servesCuisine": "", "priceRange": "$$", "telephone": "", "address": { "@type": "PostalAddress", "streetAddress": "", "addressLocality": "", "addressRegion": "", "postalCode": "", "addressCountry": "" } },
        author: { "@type": "Person", "name": "" },
        reviewRating: { "@type": "Rating", "ratingValue": "", "bestRating": "" },
        datePublished: "",
        reviewBody: "",
        publisher: { "@type": "Organization", "name": "" }
    },
    SoftwareApplication: {
        name: "",
        operatingSystem: "ANDROID",
        applicationCategory: "GameApplication",
        aggregateRating: { "@type": "AggregateRating", "ratingValue": "", "ratingCount": "" },
        offers: { "@type": "Offer", "price": "", "priceCurrency": "USD" }
    },
    VideoObject: {
        name: "",
        description: "",
        thumbnailUrl: [""],
        uploadDate: "",
        contentUrl: "",
        embedUrl: "",
        duration: "PT1M",
        interactionStatistic: { "@type": "InteractionCounter", "interactionType": { "@type": "WatchAction" }, "userInteractionCount": 0 },
        regionsAllowed: ["US", "NL"]
    },
    WebSite: {
        name: "",
        url: "",
        potentialAction: { "@type": "SearchAction", "target": { "@type": "EntryPoint", "urlTemplate": "https://example.com/search?q={search_term_string}" }, "query-input": "required name=search_term_string" }
    }
};
