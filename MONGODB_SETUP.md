# MongoDB Setup Guide for Discord Bump Bot

## What is MongoDB?

MongoDB is a free cloud database that stores your bot's state (whether it should be in VC, bump timestamps, etc.). This way, when your bot restarts on Railway, it remembers everything!

---

## Step 1: Create MongoDB Atlas Account

1. Go to [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Click **"Try Free"** (no credit card needed)
3. Sign up with email or Google
4. Verify your email

---

## Step 2: Create a Free Cluster

1. After signing up, you'll see **"Create a Deployment"**
2. Select **M0 (Free Forever)** - it's completely free!
3. Choose **AWS** as provider
4. Choose any region (closest to you is best)
5. Click **"Create Deployment"**
6. Wait 1-2 minutes for cluster to be created

---

## Step 3: Create Database User

1. In left sidebar, click **"Database Access"**
2. Click **"+ Add New Database User"**
3. Choose **"Password" authentication**
4. Username: `botuser` (or anything you want)
5. Password: Generate secure password (save this!)
6. Click **"Add User"**

Example credentials:
```
Username: botuser
Password: MySecureP@ss123
```

---

## Step 4: Get Connection String

1. In left sidebar, click **"Clusters"**
2. Click **"Connect"** button on your cluster
3. Click **"Connect your application"**
4. Choose **"Node.js"** driver
5. Copy the connection string

It looks like:
```
mongodb+srv://botuser:MySecureP@ss123@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

---

## Step 5: Set Up Environment Variable

### For Local Testing:

1. Create/edit `.env` file in your bot directory
2. Add the connection string:
   ```
   MONGODB_URI=mongodb+srv://botuser:MySecureP@ss123@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
3. Replace `botuser` and password with YOUR credentials
4. Save and test locally: `npm start`

### For Railway:

1. Go to your Railway project dashboard
2. Click **"Variables"**
3. Add new variable:
   - Key: `MONGODB_URI`
   - Value: Your MongoDB connection string
4. Deploy!

---

## Step 6: Configure Database Name (Optional)

By default, MongoDB will use `test` database. To use a custom database name:

1. Add `?authSource=admin&w=1` to your connection string, OR
2. Modify the string to include database name:
   ```
   mongodb+srv://botuser:password@cluster.mongodb.net/discord_bot?retryWrites=true&w=majority
   ```

---

## How the Bot Uses MongoDB

✅ **On startup:**
- Connects to MongoDB
- Loads your state (userWantsVC, bump timestamps)

✅ **When you use commands:**
- `%golive` → Saves `userWantsVC: true` to MongoDB
- `%gooffline` → Saves `userWantsVC: false` to MongoDB

✅ **On restart/redeploy:**
- Bot reads MongoDB
- Sees you wanted to stay in VC
- Automatically rejoins! 🎯

---

## Troubleshooting

### "MONGODB_URI not set"
- Make sure you added `MONGODB_URI` to `.env` (local) or Variables (Railway)
- Restart the bot after adding the variable

### "Connection timeout"
- Check if your IP is whitelisted in MongoDB Atlas
- Go to **"Network Access"** → Add your IP (or 0.0.0.0 for anywhere)

### "Authentication failed"
- Double-check username and password are correct
- Make sure you're using the right connection string format

### "Connection refused"
- MongoDB Atlas servers might be slow
- Bot will retry automatically
- Wait 10-30 seconds

---

## Free Tier Limits

✅ **What's free:**
- Up to 512 MB storage
- 3 free shared clusters
- Unlimited connections
- Unlimited read/write operations

❌ **When you might upgrade:**
- Need more than 512 MB storage
- Need dedicated cluster (for production)
- Need advanced features

For a bump bot, the free tier is MORE than enough! 🚀

---

## Test It Works

1. Deploy bot to Railway with `MONGODB_URI` set
2. Use `%golive` to join VC
3. Check MongoDB Atlas dashboard:
   - Collections → State → Find document with `userWantsVC: true`
4. Restart the bot on Railway
5. Check if bot automatically rejoined VC ✅

If it works, you're done! 🎉

---

## Need Help?

- MongoDB Docs: https://docs.mongodb.com/
- Railway Docs: https://docs.railway.app/
- Contact MongoDB Support: support@mongodb.com
