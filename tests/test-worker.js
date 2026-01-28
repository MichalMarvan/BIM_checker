// Simple test worker for unit tests
self.onmessage = function(e) {
    const { taskId, type, data } = e.data;

    // Echo back the data
    self.postMessage({
        taskId,
        type: 'RESULT',
        data: data
    });
};
