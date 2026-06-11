import {uploadToCloudinary} from "../../utils/cloudinary.js";
import Property from "../../DB/Models/property.model.js";


export const createProperty = async (req, res) => {
    try {
        let imageUrls = [];
        if (req.files && req.files.length > 0) {
            const uploadPromises = req.files.map(file =>
                uploadToCloudinary(file.buffer, 'properties')
            );
            imageUrls = await Promise.all(uploadPromises);
        }

        const newProperty = await Property.create({
            ...req.body,
            images: imageUrls,
            // only for testing
            ownerId: "666666666666666666666666",
            //requires the middle ware
            // ownerId: req.user.id
        });

        res.status(201).json({ success: true, data: newProperty });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteProperty = async (req, res) => {
    try {
        const property = await Property.findById(req.params.id);
        if (!property) return res.status(404).json({ message: 'Property not found' });
        await property.deleteOne();
        res.status(200).json({ message: 'Property deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};