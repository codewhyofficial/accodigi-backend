import * as adminService from '../services/admin.service.js';
import catchAsync from '../utils/catchAsync.js';

export const createAdmin = catchAsync(async (req, res, next) => {
    const admin = await adminService.createAdmin(req.body);
    res.status(201).json({
        status: 'success',
        data: {
            admin,
        },
    });
});

export const loginAdmin = catchAsync(async (req, res, next) => {
    const { admin, token } = await adminService.loginAdmin(req.body.email, req.body.password);
    res.status(200).json({
        status: 'success',
        token,
        data: {
            admin,
        },
    });
});

export const getAllClients = catchAsync(async (req, res, next) => {
    const clients = await adminService.getAllClients();
    res.status(200).json({
        status: 'success',
        results: clients.length,
        data: {
            clients,
        },
    });
});

export const getAllCAs = catchAsync(async (req, res, next) => {
    const cas = await adminService.getAllCAs();
    res.status(200).json({
        status: 'success',
        results: cas.length,
        data: {
            cas,
        },
    });
});

export const getAllAdmins = catchAsync(async (req, res, next) => {
    const admins = await adminService.getAllAdmins();
    res.status(200).json({
        status: 'success',
        results: admins.length,
        data: {
            admins,
        },
    });
});

export const updateClientStatus = catchAsync(async (req, res, next) => {
    const client = await adminService.updateClientStatus(req.params.id, req.body.status);
    res.status(200).json({
        status: 'success',
        data: { client }
    });
});

export const updateClient = catchAsync(async (req, res, next) => {
    const client = await adminService.updateClient(req.params.id, req.body);
    res.status(200).json({
        status: 'success',
        data: { client }
    });
});

export const createClient = catchAsync(async (req, res, next) => {
    const client = await adminService.createClientForCA(req.params.caId, req.body);
    res.status(201).json({
        status: 'success',
        data: { client }
    });
});

export const deleteClient = catchAsync(async (req, res, next) => {
    await adminService.deleteClient(req.params.id);
    res.status(204).json({
        status: 'success',
        data: null
    });
});

export const updateCA = catchAsync(async (req, res, next) => {
    const ca = await adminService.updateCA(req.params.id, req.body);
    res.status(200).json({
        status: 'success',
        data: { ca }
    });
});

export const createCA = catchAsync(async (req, res, next) => {
    const ca = await adminService.createCA(req.body);
    res.status(201).json({
        status: 'success',
        data: { ca }
    });
});

export const deleteCA = catchAsync(async (req, res, next) => {
    await adminService.deleteCA(req.params.id);
    res.status(204).json({
        status: 'success',
        data: null
    });
});


