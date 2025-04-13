const fs = require("fs");
const { execSync } = require("child_process");
const videoUrl = process.env.VIDEO_URL;

if (videoUrl) {
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
