# Storage option: Cloudflare R2

Apollo X saves this company's attached and system-created documents in a private bucket on Cloudflare R2. R2 is S3-compatible, has **no charge for downloads (egress)**, and costs roughly US$0.015 per GB per month after a free allowance of 10 GB. Files stay private: Apollo X only hands out short-lived download links after its own permission checks.

You create the bucket and the access key in Cloudflare (a few minutes); Apollo X does not create anything in your Cloudflare account.

## Set-up steps

1. **Cloudflare account.** Sign in at dash.cloudflare.com and open **R2 Object Storage**. If R2 has never been used on the account you will be asked to enable it (a payment method is required, even though the first 10 GB is free).
2. **Copy the Account ID.** It is shown on the R2 overview page (right-hand side) as *Account ID*: 32 letters and numbers. Paste it into the Account ID box below.
3. **Create a bucket.** R2, then **Create bucket**. Choose a name such as `apollox-yourcompany` (lower case, no spaces) and leave location on Automatic. Keep it **private**: do not turn on public access or the r2.dev URL. Paste the name into the Bucket box.
4. **Create an API token.** R2 overview, then **Manage R2 API Tokens**, then **Create API token**:
   - Permission: **Object Read & Write**
   - Specify bucket: choose the bucket from step 3 (not "all buckets")
   - TTL: forever (or note the expiry date and renew before it)
   - Create. Cloudflare now shows an **Access Key ID** and a **Secret Access Key**. The secret is shown **only once**: copy both now. (Ignore the long "Token value"; Apollo X does not use it.)
5. **Enter them here.** Paste the Access Key ID and Secret Access Key into the boxes below. Apollo X works out the address (`https://<account id>.r2.cloudflarestorage.com`) and region (`auto`) itself.
6. **Click Test connection.** Apollo X writes a small test file, reads it back and deletes it. Fix anything it reports before saving.
7. **Save storage location.**

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

## Troubleshooting (Test connection messages)

- *Access key ID is not recognised*: re-copy the Access Key ID.
- *Secret does not match*: the secret is only shown once; create a new token if it was lost.
- *Bucket does not exist*: check the bucket name and Account ID.
- *Access denied*: the token needs Object Read & Write on this bucket.
- *Endpoint address could not be found*: the Account ID has a typo.
