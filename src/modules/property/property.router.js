import {uploadArray} from "../../Middleware/upload.js";
import {createProperty, deleteProperty} from "./property.controller.js";
import express from "express";


const router = express.Router();

router.post('/createproperty', uploadArray, createProperty);
router.delete('/deleteproperty', deleteProperty);

export default router;