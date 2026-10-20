# Step-by-step setup guide (Mac)

Total time: about 2 to 3 hours. Don't skip steps, and don't stop the EC2 server before the demo (its IP address changes if you do).

---

## Part 1. Get the code onto GitHub (20 min)

1. Download **short-builds.zip** from the chat and double-click it in your Downloads folder. You'll get a folder called **short-builds**.
2. Drag the **short-builds** folder onto your Desktop.
3. Check the hidden pipeline folder came across: open the folder, press **Cmd + Shift + .** (full stop). You should see a faded **.github** folder. Press the same keys again to hide it.
4. Go to https://desktop.github.com, click **Download for macOS**, open the downloaded file, and drag **GitHub Desktop** into Applications. Open it.
5. Click **Sign in to GitHub.com**, sign in through the browser as **paravxsharma1**, then click **Finish**.
6. In the top menu click **File → Add Local Repository…** → **Choose…** → pick the **short-builds** folder on your Desktop → **Add Repository**.
7. It will say "This directory does not appear to be a Git repository". Click the blue **create a repository** link.
8. Leave the name as **short-builds**. Untick **Initialize this repository with a README**. Set **Git Ignore** to **None** and **License** to **None**. Click **Create Repository**.
9. Bottom-left, if there's anything listed, type `Initial commit` in **Summary** and click **Commit to main**.
10. Click **Publish repository** (top bar). **Untick "Keep this code private"**. Click **Publish Repository**.
11. Make the staging branch: click **Current Branch** (top bar) → **New Branch** → type `staging` → **Create Branch** → click **Publish branch**.

GitHub Actions will start running and the deploy steps will fail with a red X. That's expected, because the server doesn't exist yet.

---

## Part 2. Create the server on AWS (30 min)

### 2a. Open the AWS console
- **AWS Academy / Learner Lab:** log in to Canvas → open the Learner Lab → **Start Lab** → wait for the dot next to **AWS** to turn green → click **AWS**.
- **Your own AWS account:** go to https://console.aws.amazon.com and sign in. In the top-right corner, set the region to **Asia Pacific (Sydney)**.

### 2b. Create a role so the server can send logs to CloudWatch
**Skip this if you're in Learner Lab** (it already has one called **LabInstanceProfile**).

1. In the search bar at the top, type **IAM** and click it.
2. Left menu: **Roles** → **Create role**.
3. **Trusted entity type:** AWS service. **Use case:** EC2. Click **Next**.
4. In the search box type `CloudWatchAgentServerPolicy`, tick it, click **Next**.
5. **Role name:** `short-builds-ec2-role`. Click **Create role**.

### 2c. Launch the server
1. Search bar: type **EC2** and click it. Click the orange **Launch instance** button.
2. **Name:** `short-builds-server`
3. **Application and OS Images:** click **Ubuntu**. Make sure it says **Ubuntu Server 24.04 LTS** and **Free tier eligible**.
4. **Instance type:** `t3.micro` (or `t2.micro`, whichever says Free tier eligible).
5. **Key pair:** click **Create new key pair** → name `short-builds-key` → **RSA** → **.pem** → **Create key pair**. A file called `short-builds-key.pem` downloads. Keep it in Downloads. **Never** put it in the short-builds folder.
6. **Network settings:** click **Edit** (top-right of that box).
   - Under the existing SSH rule, set **Source type** to **Anywhere**.
   - Click **Add security group rule**: **Type** HTTP, **Source type** Anywhere.
   - Click **Add security group rule** again: **Type** Custom TCP, **Port range** `8080`, **Source type** Anywhere.
7. **Configure storage:** change **8** to **20** GiB.
8. Expand **Advanced details**.
   - **IAM instance profile:** choose **short-builds-ec2-role** (or **LabInstanceProfile** in Learner Lab).
   - Scroll right to the bottom to **User data** and paste this exactly:

```
#!/bin/bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker ubuntu
mkdir -p /home/ubuntu/short-builds
chown ubuntu:ubuntu /home/ubuntu/short-builds
```

9. Click **Launch instance** (right side). Then click the instance ID link (starts with `i-`).
10. Wait until **Instance state** says **Running** and **Status check** says **2/2 checks passed** (about 3 to 5 minutes, click the refresh button).
11. Tick the instance, and in the bottom panel copy the **Public IPv4 address** (e.g. `3.25.104.17`). Paste it into Notes. This is your server's address.

Docker installs itself in the background. Give it 5 minutes after the checks pass.

---

## Part 3. Give GitHub the keys to the server (10 min)

1. Go to https://github.com/paravxsharma1/short-builds
2. Click **Settings** (top bar of the repo) → left menu **Secrets and variables** → **Actions** → **New repository secret**.
3. **Name:** `EC2_HOST`. **Secret:** your Public IPv4 address (numbers only, no http). Click **Add secret**.
4. Open Finder → Downloads → right-click **short-builds-key.pem** → **Open With** → **TextEdit**. Press **Cmd + A**, then **Cmd + C**.
5. Back on GitHub click **New repository secret**. **Name:** `EC2_SSH_KEY`. **Secret:** press **Cmd + V**. It must start with `-----BEGIN` and end with `KEY-----`. Click **Add secret**.
6. Close TextEdit **without saving** any changes.

---

## Part 4. Deploy to staging (15 min)

1. On the repo page click the **Actions** tab.
2. Click the run that says **staging** under it (the one from when you published the branch).
3. Top-right, click **Re-run jobs** → **Re-run all jobs** → **Re-run jobs**.
4. Watch the four boxes go green in order: **Unit and API tests → Build and push Docker image → Deploy to staging → k6 load test**. Takes about 3 to 4 minutes.
5. Open a new browser tab and go to `http://YOUR-IP:8080` (use **http**, not https). Shorten a link and click it. It should take you to the original page.

If **Deploy to staging** fails, click it to see the error and send me a screenshot.

---

## Part 5. Deploy to production with a pull request (10 min)

1. On the repo page click **Pull requests** → **New pull request**.
2. Set **base: main** and **compare: staging**. Click **Create pull request**, type a title like `Release v1`, click **Create pull request** again.
3. Wait for the **Unit and API tests** check to go green on the pull request page.
4. Click **Merge pull request** → **Confirm merge**.
5. Go to **Actions**. A new run on **main** starts: tests → build → **Deploy to production**.
6. When it's green, open `http://YOUR-IP` (no port). That's production.

If the first run on main from Part 1 is still red, ignore it. Only the newest run matters.

---

## Part 6. CloudWatch logs and an alarm (15 min)

### See the logs
1. AWS console search bar → **CloudWatch** → left menu **Logs → Log groups**.
2. Click **short-builds-production** → click the log stream inside it.
3. Shorten a few links on the production site, then click **Refresh** here. Each request appears as a line of JSON with the status code and how many milliseconds it took.

### Create a CPU alarm
1. CloudWatch left menu → **Alarms → All alarms** → **Create alarm** → **Select metric**.
2. Click **EC2** → **Per-Instance Metrics**. Find the row with your instance ID and **CPUUtilization**. Tick it → **Select metric**.
3. **Threshold:** Greater than `70`. Click **Next**.
4. **Notification:** choose **Create new topic**, name `short-builds-alerts`, enter your email, click **Create topic**. (If Learner Lab gives an error here, click **Remove** on the notification box.) Click **Next**.
5. **Alarm name:** `short-builds-high-cpu` → **Next** → **Create alarm**.
6. If you added an email, check your inbox and click **Confirm subscription**.

---

## Part 7. Practise the demo once (20 min)

This shows the whole pipeline working with a real change.

1. On GitHub, use the branch dropdown (top-left, says **main**) to switch to **staging**.
2. Open **public → index.html** → click the pencil icon (Edit).
3. Find `Paste a long link, get a short one.` and change it to `Paste a long link, get a short one. Now with CI/CD!`
4. Click **Commit changes…** → **Commit changes**.
5. Go to **Actions** and watch it deploy to staging. Refresh `http://YOUR-IP:8080`: new text. Production `http://YOUR-IP` still shows the old text.
6. Make a pull request from staging to main (Part 5) and merge. Production now shows the new text.

Take screenshots of: the green Actions run, the k6 results (click the k6 job, scroll to the bottom), the coverage table (in the tests job), the staging and production sites, the CloudWatch log stream and the alarm.
