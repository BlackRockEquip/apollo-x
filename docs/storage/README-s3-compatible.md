# Storage option: Other S3-compatible storage

Use this for Backblaze B2, Amazon S3, Wasabi, a MinIO server on your own premises, or a Cloudflare R2 bucket in an EU/FedRAMP jurisdiction. Anything that speaks the S3 API works.

## You need from your provider

- **Bucket name**: a private bucket you created.
- **Endpoint**: the S3 address, for example `https://s3.us-west-004.backblazeb2.com` (B2), `https://s3.eu-west-1.amazonaws.com` (S3), `http://minio.yourcompany.local:9000` (MinIO).
- **Region**: the provider's region code (for example `us-west-004`, `eu-west-1`). Use `auto` if the provider has no regions.
- **Access key ID and Secret access key**: limited to this bucket with read, write and delete rights.

## Steps

1. Create the private bucket and an access key in your provider's console.
2. Enter bucket, endpoint, region, access key ID and secret below.
3. Click **Test connection** (writes, reads back and deletes a small file), then **Save storage location**.

## Notes

- A MinIO server on your own premises is how you keep files on-site while Apollo X runs in the cloud. Apollo X must be able to reach it over the network (HTTPS recommended).
- Your secret access key is encrypted before it is saved and never shown again; leave the box blank to keep it.
- Apollo X does not move files by itself when storage changes: you export the current files first, then import them into the new location (see below).

## Which documents use this

Every file Apollo X keeps for this company: job attachments, documents saved from a job (Job Card, Job History, Delivery Note, Pick Slip, Parts List, Outwork Delivery Note), RFQ request and quote files, support ticket attachments and the company logo. Core records (jobs, stock, customers) always stay in the database.

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

