const fs = require("fs");
const { execSync } = require("child_process");
const videoUrl = process.env.VIDEO_URL;
const AWS_REGION = process.env.AWS_REGION
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY
const AWS_BUCKET_NAME = process.env.AWS_BUCKET_NAME

if (videoUrl && AWS_REGION && AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY && AWS_BUCKET_NAME) {
  console.log(`Downloading video from ${videoUrl}...`);
  try {
    execSync(`curl -L "${videoUrl}" -o ./input/input.mp4`, {
      stdio: "inherit",
    });
    console.log("Download complete, starting transcoding...");
    require("./index.js");
  } catch (error) {
    console.error("Error downloading or processing video:", error.message);
    process.exit(1);
  }
} else {
  console.log("No VIDEO_URL provided. Using existing input file if available.");
  if (fs.existsSync("./input/input.mp4")) {
    require("./index.js");
  } else {
    console.error("No input video found at ./input/input.mp4");
    process.exit(1);
  }
}
