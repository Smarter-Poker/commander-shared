/**
 * Debug Image Extraction - Shows exactly what RSS feeds contain
 */
import Parser from 'rss-parser';
import { reportApiError } from '../../../src/lib/sentryWrap';

const rssParser = new Parser({
    customFields: {
        item: ['media:content', 'media:thumbnail', 'content:encoded', 'enclosure', 'media:group']
    }
});

function extractImage(item) {
    // Try to find img in content:encoded
    let contentEncodedImg = null;
    if (item['content:encoded']) {
        const imgMatch = item['content:encoded'].match(/<img[^>]+src=["']([^"']+)["']/i);
        contentEncodedImg = imgMatch ? imgMatch[1] : 'NO_MATCH';
    }

    const results = {
        hasEnclosure: !!item.enclosure,
        enclosureUrl: item.enclosure?.url,
        hasMediaContent: !!item['media:content'],
        mediaContentRaw: JSON.stringify(item['media:content']),
        hasMediaThumbnail: !!item['media:thumbnail'],
        mediaThumbnailRaw: JSON.stringify(item['media:thumbnail']),
        hasMediaGroup: !!item['media:group'],
        descriptionHasImg: item.description?.includes('<img'),
        contentHasImg: item.content?.includes('<img'),
        contentEncodedHasImg: item['content:encoded']?.includes('<img'),
        contentEncodedImgExtract: contentEncodedImg,
        contentEncodedSample: item['content:encoded']?.substring(0, 500),
        extractedUrl: null
    };

    // Try enclosure
    if (item.enclosure?.url) {
        results.extractedUrl = item.enclosure.url;
        results.extractedFrom = 'enclosure';
        return results;
    }

    // Try media:content
    if (item['media:content']) {
        const media = Array.isArray(item['media:content']) ? item['media:content'][0] : item['media:content'];
        if (media?.$?.url) {
            results.extractedUrl = media.$.url;
            results.extractedFrom = 'media:content.$';
            return results;
        }
        if (media?.url) {
            results.extractedUrl = media.url;
            results.extractedFrom = 'media:content.url';
            return results;
        }
    }

    // Try media:thumbnail
    if (item['media:thumbnail']) {
        const thumb = Array.isArray(item['media:thumbnail']) ? item['media:thumbnail'][0] : item['media:thumbnail'];
        if (thumb?.$?.url) {
            results.extractedUrl = thumb.$.url;
            results.extractedFrom = 'media:thumbnail.$';
            return results;
        }
        if (thumb?.url) {
            results.extractedUrl = thumb.url;
            results.extractedFrom = 'media:thumbnail.url';
            return results;
        }
    }

    // Try description img
    if (item.description) {
        const imgMatch = item.description.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgMatch) {
            results.extractedUrl = imgMatch[1];
            results.extractedFrom = 'description img';
            return results;
        }
    }

    results.extractedFrom = 'none';
    return results;
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    // Block in production — this is a debug/dev-only endpoint.
    // Operators may still access it in production with a matching x-admin-key.
    const adminKey = process.env.ADMIN_API_KEY;
    const hasAdminKey = adminKey && req.headers['x-admin-key'] === adminKey;
    if (process.env.NODE_ENV === 'production' && !hasAdminKey) {
        return res.status(404).json({ error: 'Not found' });
    }
    const results = [];

    const testFeeds = [
        { name: 'PokerNews', url: 'https://www.pokernews.com/news.rss' },
        { name: 'Upswing', url: 'https://upswingpoker.com/feed/' },
        { name: 'Google News', url: 'https://news.google.com/rss/search?q=poker+news+today&hl=en-US&gl=US&ceid=US:en' }
    ];

    for (const feed of testFeeds) {
        try {
            const parsed = await rssParser.parseURL(feed.url);
            const item = parsed.items[0];

            results.push({
                source: feed.name,
                title: item.title?.substring(0, 60),
                link: item.link?.substring(0, 80),
                ...extractImage(item)
            });
        } catch (error) {
            try { reportApiError(error, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
            results.push({ source: feed.name, error: error.message });
        }
    }

    return res.status(200).json({ results });
}
