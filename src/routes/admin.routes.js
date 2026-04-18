import express from 'express';
import * as adminController from '../controllers/admin.controller.js';
// import { protect, restrictTo } from '../middlewares/auth.middleware.js'; // Assuming you have middleware for protection

const router = express.Router();

router.post('/register', adminController.createAdmin); // Open for now, or protect later
router.post('/login', adminController.loginAdmin);

router.get('/clients', adminController.getAllClients);
router.get('/cas', adminController.getAllCAs);
router.get('/usage', adminController.getUsageStats);

// router.use(protect); // Protect all routes after this
// router.use(restrictTo('OWNER')); // Only OWNER can see all admins (example)

router.get('/', adminController.getAllAdmins);

// Client Operations
router.patch('/clients/:id/status', adminController.updateClientStatus);
router.patch('/clients/:id', adminController.updateClient);
router.delete('/clients/:id', adminController.deleteClient);

// CA Operations
router.post('/cas', adminController.createCA);
router.post('/cas/:caId/clients', adminController.createClient);
router.patch('/cas/:id', adminController.updateCA);
router.delete('/cas/:id', adminController.deleteCA);
router.get('/cas/:id/credits', adminController.getCACreditHistory);
router.post('/cas/:id/credits', adminController.adjustCACredits);


export default router;
