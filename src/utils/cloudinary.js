import multer from "multer";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

if (process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_API_KEY) {
  const maskedKey = process.env.CLOUDINARY_API_KEY
    ? `${process.env.CLOUDINARY_API_KEY.slice(0, 4)}...${process.env.CLOUDINARY_API_KEY.slice(-4)}`
    : "(not set)";
  console.log(
    `Cloudinary configured: cloud_name=${process.env.CLOUDINARY_CLOUD_NAME || "(not set)"}, api_key=${maskedKey}`,
  );
}
console.log(
  process.env.CLOUDINARY_CLOUD_NAME,
  process.env.CLOUDINARY_API_KEY,
  process.env.CLOUDINARY_API_SECRET,
);

const storage = multer.memoryStorage();

const imageFileFilter = (req, file, callback) => {
  if (!file.mimetype.startsWith("image/")) {
    return callback(new Error("عذراً، يُسمح فقط برفع الصور."), false);
  }

  callback(null, true);
};

export const upload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

export const uploadToCloudinary = (file, folder) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
      },
      (error, result) => {
        if (error) {
          console.error("Cloudinary upload error:", error);
          let message = error.message || "Cloudinary upload failed";
          if (error.http_code === 403 || error.status_code === 403) {
            message +=
              ". 403 returned: check CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET (no surrounding quotes), and verify the key is active and not IP-restricted.";
          }
          const err = new Error(message);
          err.http_code =
            error.http_code || error.status_code || error.status || null;
          err.details = error;
          return reject(err);
        }

        return resolve(result.secure_url);
      },
    );

    stream.end(file.buffer);
  });
};
