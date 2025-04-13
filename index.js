const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs");

const inputPath = path.join(__dirname, "./input/input.mp4");
const outputDir = path.join(__dirname, "./output");
const masterPlaylist = path.join(outputDir, "master.m3u8");

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

let masterContent = "#EXTM3U\n#EXT-X-VERSION:3\n";

renditions.forEach((rendition) => {
  const renditionDir = path.join(outputDir, rendition.name);
  if (!fs.existsSync(renditionDir)) {
    fs.mkdirSync(renditionDir, { recursive: true });
  }
});

const processRendition = (rendition, index) => {
  return new Promise((resolve, reject) => {
    const renditionDir = path.join(outputDir, rendition.name);
    const outputPath = path.join(renditionDir, "playlist.m3u8");

    const segmentPattern = path.join(
      renditionDir,
      `${rendition.name}_segment%03d.ts`
    );

    masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=${
      parseInt(rendition.videoBitrate) * 1000
    },RESOLUTION=${rendition.resolution}\n${rendition.name}/playlist.m3u8\n`;

    ffmpeg(inputPath)
      .outputOptions([
        "-c:v libx264",
        "-profile:v " + rendition.profile,
        "-level:v " + rendition.level,
        `-vf scale=${rendition.resolution.split("x")[0]}:${
          rendition.resolution.split("x")[1]
        }`,
        `-b:v ${rendition.videoBitrate}`,
        `-maxrate ${rendition.maxrate}`,
        `-bufsize ${rendition.bufsize}`,
        `-c:a aac`,
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
        console.log(`Processing ${rendition.name}: ${p.percent.toFixed(2)}%`)
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
};

async function processAllRenditions() {
  try {
    for (let i = 0; i < renditions.length; i++) {
      await processRendition(renditions[i], i);
    }

    fs.writeFileSync(masterPlaylist, masterContent);
    console.log("✅ Master playlist created");
    console.log("✅ All processing complete");
  } catch (error) {
    console.error("❌ Processing failed:", error);
  }
}

processAllRenditions();
