const express = require("express")
const cors = require("cors")
const { Server } = require('socket.io')
const fs = require("fs")
const http = require("http")
const dotenv = require("dotenv")
const { Readable } = require("stream")
const axios = require("axios")
// const {S3Client, PutObjectCommand} = require("@aws-sdk/client-s3")
// const OpenAI = require("openai")
const cloudinary = require("cloudinary").v2

const app = express()
const server = http.createServer(app)
app.use(cors())
dotenv.config()

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
})

// const openai = new OpenAI({
//     apikey: process.env.OPEN_AI_KEY,
// })

// const s3 = new S3Client({
//     credentials: {
//         accessKeyId: process.env.ACCESS_KEY,
//         secretAccessKey: process.env.SECRET_KEY,
//     },
//     region: process.env.BUCKET_REGION
// })

const io = new Server(server, {
    cors: {
        origin: process.env.ELECTRON_HOST,
        methods: ["GET", "POST"],
    },
})

let recordedChunks = [];

io.on("connection", (socket) => {
    console.log("🟢 Socket is connected")
    socket.on("video-chunks", async (data) => {
        console.log("🟢 Video chunk is sent", data)
        const writeStream = fs.createWriteStream("temp_upload/" + data.filename)
        recordedChunks.push(data.chunks)
        const videoBlob = new Blob(recordedChunks, {
            type: "video/webm; codecs=vp9",
        })
        const buffer = Buffer.from(await videoBlob.arrayBuffer())
        const readStream = Readable.from(buffer)
        readStream.pipe(writeStream).on("finish", () => {
            console.log("🟢 Chunk Saved")
        })

    })
    socket.on("process-video", async (data) => {
        console.log("🟢 Video is processing", data)
        recordedChunks = []
        fs.readFile("temp_upload/" + data.filename, async (err, file) => {
            if (err) {
                console.log("🔴 Error reading file", err);
                return;
            }

            const processing = await axios.post(`${process.env.NEXT_API_HOST}recording/${data.userId}/processing`,{
                filename: data.filename
            })
            if (processing.data.status !== 200) return console.log("🔴 Error: Something went wrong with creating the processing file")

            const cloudinaryUpload = await cloudinary.uploader.upload_stream(
                {
                    resource_type: "video",
                    folder: "opal",
                    public_id: data.filename,
                },
                async (err, result) => {
                    if (err) {
                        console.log("🔴 Error uploading file on cloudinary")
                    }
                    console.log("🟢 Video uploaded to cloudinary : ", result.secure_url);
                    const stopProcessing = await axios.post(
                        `${processing.env.NEXT_API_HOST}recording/${data.userId}/complete`,
                        { filename: data.filename }
                    )
                    if (stopProcessing.data.status !== 200) {
                        console.log("🔴 Error: Something went wrong when stopping the process and trying to complete the processing stage.")
                    }

                    if (stopProcessing.data.status === 200) {
                        fs.unlink("temp_upload/" + data.filename, (err) => {
                            if (!err) console.log(data.filename + " " + "🟢 deleted successfuly")
                        })
                    }
                }
            );

            fs.createReadStream("temp_upload/" + data.filename).pipe(cloudinaryUpload);
            // const processing = await axios.post(`${process.env.NEXT_API_HOST}recording/${data.userId}/processing`)
            // if(processing.data.status !==200) return console.log("🔴 Error: Something went wrong with creating the processing file")
            // const Key = data.filename
            // const Bucket = process.env.BUCKET_NAME
            // const ContentType = "video/webm"
            // const command = new PutObjectCommand({
            //     Key,
            //     Bucket,
            //     ContentType,
            //     Body: file,
            // })

            // const fileStatus = await s3.send(command)

            // if (fileStatus['$metadata'].httpStatusCode === 200) {
            //     console.log("🟢 Video uploaded to AWS")

            //     if(processing.data.plan === "PRO") {
            //         fs.stat("temp_upload/" + data.filename, async (err,stat) => {
            //             if(!err) {
            //                 if(stat.size < 25000000) {
            //                     const transcription = await openai.audio.transcriptions.create({
            //                         file: fs.createReadStream(`temp_upload/${data.filename}`),
            //                         model: "whisper-1",
            //                         response_format: "text",
            //                     })

            //                     if (transcription) {
            //                         const completion = await openai.chat.completions.create({
            //                             model: "gpt-3.5-turbo",
            //                             response_format: { type: "json_object" },
            //                             message: [
            //                                 {
            //                                     role: "system",
            //                                     content: `You are going to generate a title and nice description using the speech to text transcription provided : transcription(${transcription}) and then return it in json format as {"title": <the title you gave>, "summery": <the summary you created>}`,
            //                                 },
            //                             ],
            //                         })
            //                         const titleSummaryGenerated = await axios.post(`${process.env.NEXT_API_HOST}recording/${data.userId}/transcribe`, {
            //                             filename: data.filename,
            //                             content: completion.choices[0].message.content,
            //                             transcript: transcription,
            //                         })

            //                         if(titleSummaryGenerated.data.status !==200) {
            //                             console.log("🔴 Error: Something went wrong with creating the title and description")
            //                         }

            //                     }
            //                 }
            //             }
            //         })
            //     }
            //     const stopProcessing = await axios.post(
            //         `${processing.env.NEXT_API_HOST}recording/${data.userId}/complete`,
            //         {filename: data.filename}
            //     )
            //     if(stopProcessing.data.status !== 200) {
            //         console.log("🔴 Error: Something went wrong when stopping the process and trying to complete the processing stage.")
            //     }

            //     if(stopProcessing.data.status === 200) {
            //         fs.unlink("temp_upload/" + data.filename, (err) => {
            //             if(!err) console.log(data.filename + " " + "🟢 deleted successfuly")
            //         })
            //     }

            // } else {
            //     console.log("🔴 Error. Upload failed!")
            // }

        })
    })
    socket.on("disconnect", async (data) => {
        console.log("🔴 Disconnected from socket io")
    })
})
server.listen(5000, () => {
    console.log("🟢 Listening on port 5000")
})

