const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs");
const { S3 } = require("@aws-sdk/client-s3");
const { config } = require("dotenv")
config()

// Configuration
const inputPath = path.join(__dirname, "./input/input.mp4");
const outputDir = path.join(__dirname, "./output");
const masterPlaylist = path.join(outputDir, "master.m3u8");

// Validate input file
if (!fs.existsSync(inputPath)) {
  throw new Error(`Input file not found: ${inputPath}`);
}

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const renditions = [
  {
    name: "1080p",
    resolution: "1920x1080",
    videoBitrate: "5000k",
    audioBitrate: "192k",
    profile: "high",
    level: "4.0",
    maxrate: "5350k",
    bufsize: "7500k",
  },
  {
    name: "720p",
    resolution: "1280x720",
    videoBitrate: "2500k",
    audioBitrate: "128k",
    profile: "main",
    level: "3.1",
    maxrate: "2675k",
    bufsize: "4000k",
  },
  {
    name: "480p",
    resolution: "854x480",
    videoBitrate: "1000k",
    audioBitrate: "96k",
    profile: "main",
    level: "3.0",
    maxrate: "1070k",
    bufsize: "1500k",
  },
  {
    name: "360p",
    resolution: "640x360",
    videoBitrate: "600k",
    audioBitrate: "96k",
    profile: "main",
    level: "3.0",
    maxrate: "640k",
    bufsize: "900k",
  },
  {
    name: "240p",
    resolution: "426x240",
    videoBitrate: "400k",
    audioBitrate: "64k",
    profile: "baseline",
    level: "3.0",
    maxrate: "432k",
    bufsize: "600k",
  },
  {
    name: "144p",
    resolution: "256x144",
    videoBitrate: "200k",
    audioBitrate: "48k",
    profile: "baseline",
    level: "3.0",
    maxrate: "216k",
    bufsize: "300k",
  },
];

// Process each rendition
async function processRenditions() {
  let masterContent = "#EXTM3U\n#EXT-X-VERSION:3\n";

  // Create directories first
  for (const rendition of renditions) {
    const renditionDir = path.join(outputDir, rendition.name);
    if (!fs.existsSync(renditionDir)) {
      fs.mkdirSync(renditionDir, { recursive: true });
    }
  }

  // Process each rendition sequentially
  for (const rendition of renditions) {
    await new Promise((resolve, reject) => {
      const renditionDir = path.join(outputDir, rendition.name);
      const outputPath = path.join(renditionDir, "playlist.m3u8");
      const segmentPattern = path.join(renditionDir, `${rendition.name}_segment%03d.ts`);

      // Add to master playlist
      masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=${
        parseInt(rendition.videoBitrate) * 1000
      },RESOLUTION=${rendition.resolution}\n${rendition.name}/playlist.m3u8\n`;

      ffmpeg(inputPath)
        .outputOptions([
          "-c:v libx264",
          `-profile:v ${rendition.profile}`,
          `-level:v ${rendition.level}`,
          `-vf scale=${rendition.resolution.split("x")[0]}:${
            rendition.resolution.split("x")[1]
          }`,
          `-b:v ${rendition.videoBitrate}`,
          `-maxrate ${rendition.maxrate}`,
          `-bufsize ${rendition.bufsize}`,
          "-c:a aac",
          `-b:a ${rendition.audioBitrate}`,
          "-ac 2",
          "-f hls",
          "-hls_time 4",
          "-hls_playlist_type vod",
          "-hls_flags independent_segments",
          "-hls_segment_type mpegts",
          `-hls_segment_filename ${segmentPattern}`,
          "-hls_list_size 0",
        ])
        .output(outputPath)
        .on("start", (cmd) => console.log(`Started ${rendition.name}:`, cmd))
        .on("progress", (p) =>
          console.log(`Processing ${rendition.name}: ${p.percent?.toFixed(2) || 0}%`)
        )
        .on("end", () => {
          console.log(`✅ ${rendition.name} processing done`);
          resolve();
        })
        .on("error", (err) => {
          console.error(`❌ Error in ${rendition.name}:`, err.message);
          reject(err);
        })
        .run();
    });
  }

  // Write master playlist
  fs.writeFileSync(masterPlaylist, masterContent);
  console.log("✅ Master playlist created");
  return { outputDir, masterPlaylist };
}

// Upload to S3 with retry logic
async function uploadFolder(localFolderPath, s3Prefix, maxRetries = 3) {
  if (!process.env.AWS_BUCKET_NAME) {
    throw new Error("AWS_BUCKET_NAME environment variable is required");
  }

  const client = new S3({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  function getAllFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const filePath = path.join(dir, file);
      if (fs.statSync(filePath).isDirectory()) {
        getAllFiles(filePath, fileList);
      } else {
        fileList.push(filePath);
      }
    });
    return fileList;
  }

  const allFiles = getAllFiles(localFolderPath);
  console.log(`Found ${allFiles.length} files to upload`);

  for (const filePath of allFiles) {
    const relativePath = path.relative(localFolderPath, filePath);
    const s3Key = path.join(s3Prefix, relativePath).replace(/\\/g, '/');
    
    const contentType = filePath.endsWith('.m3u8') 
      ? 'application/x-mpegURL'
      : filePath.endsWith('.ts') 
        ? 'video/MP2T' 
        : 'application/octet-stream';

    let retries = 0;
    while (retries < maxRetries) {
      try {
        console.log(`Uploading ${relativePath} to s3://${process.env.AWS_BUCKET_NAME}/${s3Key}`);
        await client.putObject({
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: s3Key,
          Body: fs.readFileSync(filePath),
          ContentType: contentType,
        });
        break;
      } catch (err) {
        retries++;
        if (retries === maxRetries) {
          console.error(`❌ Failed to upload ${relativePath} after ${maxRetries} attempts`);
          throw err;
        }
        console.log(`Retrying ${relativePath} (attempt ${retries + 1})`);
        await new Promise(resolve => setTimeout(resolve, 1000 * retries));
      }
    }
  }

  const masterUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${path.join(s3Prefix, 'master.m3u8').replace(/\\/g, '/')}`;
  console.log(`✅ Upload complete! Master playlist URL: ${masterUrl}`);
  return masterUrl;
}

// Main execution
async function main() {
  try {
    // Process video renditions
    const { outputDir, masterPlaylist } = await processRenditions();
    
    // Upload to S3 if credentials are available
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      const s3Prefix = 'videos/' + path.basename(inputPath, '.mp4') + '-' + Date.now();
      await uploadFolder(outputDir, s3Prefix);
    } else {
      console.log("AWS credentials not found - Skipping S3 upload");
    }

    console.log("✅ All processing complete");
    console.log(`HLS files ready in: ${outputDir}`);
    console.log(`Master playlist: ${masterPlaylist}`);
  } catch (error) {
    console.error("❌ Processing failed:", error);
    process.exit(1);
  }
}

main();