import * as clientService from '../services/client.service.js';
import * as gstService from '../services/gst.service.js';
import catchAsync from '../utils/catchAsync.js';
import { addClient, removeClient } from '../utils/sseClients.js';

export const createClient = catchAsync(async (req, res, next) => {
    const client = await clientService.createClient(req.user.id, req.body);
    res.status(201).json({
        status: 'success',
        data: { client }
    });
});

export const getAllClients = catchAsync(async (req, res, next) => {
    const clients = await clientService.getClients(req.user.id);
    res.status(200).json({
        status: 'success',
        results: clients.length,
        data: { clients }
    });
});


export const getClient = catchAsync(async (req, res, next) => {
    const client = await clientService.getClient(req.user.id, req.params.id);
    res.status(200).json({
        status: 'success',
        data: { client }
    });
});

export const requestTransfer = catchAsync(async (req, res, next) => {
    const request = await clientService.requestTransfer(req.user.id, req.params.id);
    res.status(200).json({
        status: 'success',
        message: 'Transfer request sent',
        data: { request }
    });
});

export const approveTransfer = catchAsync(async (req, res, next) => {
    res.status(200).json({
        status: 'success',
        message: 'Client transfer approved.'
    });
});



export const subscribeToEvents = catchAsync(async (req, res, next) => {
    const clientId = req.params.id;

    // Verify this CA owns this client
    await clientService.getClient(req.user.id, clientId);

    // Set SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Send initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`);

    // Register this SSE connection
    addClient(clientId, res);

    // Heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n');
    }, 30000);

    // Cleanup on disconnect
    req.on('close', () => {
        clearInterval(heartbeat);
        removeClient(clientId, res);
    });
});

export const getGSTR1Export = catchAsync(async (req, res, next) => {
    const { month, year } = req.query;
    // Verify ownership
    await clientService.getClient(req.user.id, req.params.id);

    const data = await gstService.getGSTR1Data(req.params.id, month, year);

    res.status(200).json({
        status: 'success',
        data
    });
});

export const getGSTR3BExport = catchAsync(async (req, res, next) => {
    const { month, year } = req.query;
    // Verify ownership
    await clientService.getClient(req.user.id, req.params.id);

    const data = await gstService.getGSTR3BData(req.params.id, month, year);

    res.status(200).json({
        status: 'success',
        data
    });
});
