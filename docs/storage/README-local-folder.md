# Storage option: Local folder on the server

Apollo X saves this company's attached and system-created documents into a folder on the **server that runs Apollo X**. No cloud account, bucket or keys are needed.

## Read this first: what "local" means

"Local" means local to the machine where Apollo X is running, not the computer of the person using it.

- **Apollo X runs on your own server (Windows or Linux, in your office or data centre):** this option is a good fit. The folder can be on that server's disk or on a network share it can reach.
- **Apollo X runs on Render (or another cloud host):** the folder is on the cloud server, not on your premises. Render's normal disk is wiped on every deploy and restart, so you MUST attach a Render *persistent disk* (see "Render" below). A persistent disk limits the service to a single instance and turns off zero-downtime deploys. If you want files kept on your own premises while Apollo X stays in the cloud, use the Cloudflare R2 option instead, or run a MinIO server on your premises and choose "Other S3-compatible".

## Which documents use this

Every file Apollo X keeps for this company: job attachments, documents saved from a job (Job Card, Job History, Delivery Note, Pick Slip, Parts List, Outwork Delivery Note), RFQ request and quote files, support ticket attachments and the company logo. Core records (jobs, stock, customers) always stay in the database.

## Set-up steps

1. **Pick the folder.** Use a full path on the Apollo X server, for example `D:\ApolloXFiles` (Windows), `\\FILESERVER\ApolloX` (network share) or `/var/apollox/files` (Linux). Plain relative paths and anything containing `..` are refused.
2. **Create it and give access.** The folder can be empty. The account that runs Apollo X (the Windows service account, or the Linux user running `npm start`) needs **read, write and delete** permission on it. For a network share, use the UNC path (`\\server\share`), not a mapped drive letter such as `Z:`: services do not see drive letters mapped for a signed-in user.
3. **Plan backups.** Include the folder in your normal server backup. These files are NOT in the database backup.
4. **Enter the path** in the Folder path box below.
5. **Click Test connection.** Apollo X writes a small test file into the folder, reads it back and deletes it. Fix any error shown before saving.
6. **Save storage location.**

## Render persistent disk

1. In the Render dashboard open the Apollo X web service, then **Disks**, then **Add Disk**.
2. Choose a mount path, for example `/var/data`, and a size.
3. Use `/var/data/apollox-files` as the folder path here.

## How files are laid out

Each job gets its own folder named after the job number, created when the job is created:

```
BRE1122/
  BRE1122 - Job History.pdf
  BRE1122 - Delivery Note.pdf
  BRE1122 - Outwork Delivery Note - <supplier>.pdf
  Customer purchase order.pdf        (a file someone attached keeps the name they gave it)
  Supplier quote.pdf                 (RFQ quotes for this job)
RFQs/                                (RFQs that are not linked to a job)
Support/<ticket number>/             (support ticket attachments)
Company/                             (the company logo)
```

Documents saved from a job are named **`<job number> - <document title>.pdf`**. The titles are set by an Org Admin under Configuration, then Document titles. If two files would get the same name, the second becomes `... (2).pdf`. Files someone uploads keep the name they gave them.

Do not rename or move these files by hand: Apollo X finds each file by its exact path.

## Moving existing files onto this storage

Files uploaded before this storage was chosen stay in the database until you move them. Once the location is saved, the Storage location panel shows **Move files to this storage**. It copies every job, RFQ and support file into the layout above, checks each copy by reading it back, and only then clears it from the database. It can be run again safely if it is interrupted.

## Changing storage later

Apollo X never moves files between locations by itself. If this company already has stored files, saving a different location asks you to **export the current files first**: a .zip that mirrors the folder layout above, plus a manifest. After the change, old files cannot be opened until you bring them back:

1. Save the new location and test it.
2. In the Storage location panel choose **Import exported files** and select the .zip you exported.
3. Apollo X matches each file by its path (or by file name and size), writes it into the new location, and reports how many were restored. Importing the same .zip twice is harmless.

## Troubleshooting

- *The folder (or its drive/share) does not exist on the server*: check the path and that the share is online for the service account.
- *Not allowed to write to that folder*: grant the Apollo X service account Modify permission.
- *Disk is full*: free space or choose a larger disk.
