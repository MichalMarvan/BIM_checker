/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * IFC parser worker. Single message type: PARSE.
 * Delegates to IFCParserCore.parseIFCContent for actual work.
 *
 * Pool dispatcher (WorkerPool) wraps each task in a taskId envelope:
 *   incoming: { taskId, type: 'PARSE', data: { content, fileName } }
 *   reply:    { taskId, type: 'PARSE_DONE', data: entities[] }
 *   error:    { taskId, error: 'message' }
 */
importScripts('../common/property-set-index.js');
importScripts('../common/ifc-parser-core.js');

self.onmessage = function(e) {
    const { taskId, type, data } = e.data;
    if (type !== 'PARSE') return;

    try {
        const entities = self.IFCParserCore.parseIFCContent(data.content, data.fileName);
        self.postMessage({ taskId, type: 'PARSE_DONE', data: entities });
    } catch (err) {
        self.postMessage({ taskId, error: err.message || String(err) });
    }
};
