const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { pipeline } = require("stream/promises");
const { config } = require("dotenv")
config()
const inputDir = "./input";
const inputPath = path.join(inputDir, "input.mp4");
const videoUrl = process.env.VIDEO_URL;

const awsConfig = {
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};
const bucketName = process.env.AWS_BUCKET_NAME;

async function ensureInputDirectory() {
  if (!fs.existsSync(inputDir)) {
    fs.mkdirSync(inputDir, { recursive: true });
  }
}

async function downloadWithAWSSDK() {
  if (!bucketName || !videoUrl) return false;

  try {
    console.log("Attempting to download via AWS SDK...");
    const s3 = new S3Client(awsConfig);

    const key =
      videoUrl.split(
        `${bucketName}.s3.${awsConfig.region}.amazonaws.com/`
      )[1] || videoUrl.split(`${bucketName}/`)[1];

    if (!key) {
      console.warn("Could not extract S3 key from URL");
      return false;
    }

    const { Body } = await s3.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      })
    );

    await pipeline(Body, fs.createWriteStream(inputPath));
    return true;
  } catch (error) {
    console.warn(`AWS SDK download failed: ${error.message}`);
    return false;
  }
}

async function checkExistingFile() {
  if (fs.existsSync(inputPath)) {
    const stats = fs.statSync(inputPath);
    if (stats.size > 0) {
      console.log(`Using existing input file (${stats.size} bytes)`);
      return true;
    }
  }
  return false;
}

async function main() {
  await ensureInputDirectory();

  if (!videoUrl) {
    if (await checkExistingFile()) {
      require("./index.js");
      return;
    }
    console.error("No input video available");
    process.exit(1);
  }

  const downloadSuccess = (await downloadWithAWSSDK());

  if (!downloadSuccess && !(await checkExistingFile())) {
    console.error("All download methods failed and no existing file found");
    process.exit(1);
  }

  try {
    const stats = fs.statSync(inputPath);
    if (stats.size === 0) {
      fs.unlinkSync(inputPath);
      throw new Error("Downloaded empty file");
    }
    console.log(`Download successful (${stats.size} bytes)`);
    require("./index.js");
  } catch (error) {
    console.error(`File verification failed: ${error.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
