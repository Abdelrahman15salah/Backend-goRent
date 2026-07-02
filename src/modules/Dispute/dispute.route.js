import { Router } from "express";
const router = Router();
import { verifyRole, verifyAuth } from "../../Middleware/Auth.Middleware.js";
import { validateCreateDispute } from "./dispute.validation.js";
import * as DC from "./dispute.controller.js";

router.post(
  "/",
  verifyAuth,
  verifyRole(["tenant", "owner"]),
  validateCreateDispute,
  DC.createDispute,
);
router.get("/eligibility/:propertyId", verifyAuth, DC.checkEligibility);
router.get("/", verifyAuth, verifyRole(["admin"]), DC.getDisputes);
router.get("/my", verifyAuth, DC.getMyDisputes);
router.get("/:id", verifyAuth, verifyRole(["admin"]), DC.getDisputeById);
router.patch(
  "/:id/review",
  verifyAuth,
  verifyRole(["admin"]),
  DC.markDisputeInReview,
);
router.patch(
  "/:id/resolve",
  verifyAuth,
  verifyRole(["admin"]),
  DC.resolveDispute,
);
router.patch(
  "/:id/reject",
  verifyAuth,
  verifyRole(["admin"]),
  DC.rejectDispute,
);
router.delete(
  "/:id",
  verifyAuth,
  verifyRole(["admin", "superadmin"]),
  DC.deleteDispute,
);

export default router;
