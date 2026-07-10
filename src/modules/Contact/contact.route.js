import express from "express";
import { optionalAuth, verifyRole,verifyAuth } from "../../Middleware/Auth.Middleware.js";
import {
  submitContact,
  getAllContacts,
  updateContactStatus,
  deleteContact,
} from "./contact.controller.js";

const router = express.Router();

router.post("/", optionalAuth, submitContact);

router.use(verifyAuth, verifyRole(["admin", "superadmin"]));

router.get("/", getAllContacts);
router.patch("/:id/status", updateContactStatus);
router.delete("/:id", deleteContact);

export default router;
