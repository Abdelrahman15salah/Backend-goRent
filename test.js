import 'dotenv/config';
import fs from 'fs';
import { uploadToCloudinary, deleteFromCloudinary } from './src/utils/cloudinary.js';

async function runDetailedTest() {
    console.log('--- Starting Cloudinary Integration Test ---');

    const testFilePath = './test-image.jpg'; // Place a dummy image here

    if (!fs.existsSync(testFilePath)) {
        console.error('Error: Please provide a test-image.jpg file in the root.');
        return;
    }

    try {
        // 1. Prepare Buffer (Simulates multer's req.file.buffer)
        const fileBuffer = fs.readFileSync(testFilePath);
        console.log('Step 1: Buffer created successfully.');

        // 2. Test Upload
        console.log('Step 2: Uploading to Cloudinary...');
        const result = await uploadToCloudinary(fileBuffer, 'test_folder');
        console.log('Upload Success! Data received:', result);

        // 3. Test Delete
        console.log('Step 3: Deleting uploaded file to clean up...');
        const deleteResult = await deleteFromCloudinary(result.publicId);
        console.log('Delete Success! Status:', deleteResult.result);

        console.log('--- Test Completed Successfully ---');
    } catch (error) {
        console.error('Test Failed:', error.message);
    }
}

export {runDetailedTest};