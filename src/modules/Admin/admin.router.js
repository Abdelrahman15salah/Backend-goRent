import { Router } from "express";
import {toggleBanStatus} from "./userManagment.controller.js";
const router = Router();

router.patch('/:id/ban',toggleBanStatus );
router.patch('/:id/unban',toggleBanStatus );

export default router;