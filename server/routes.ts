import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { urlFormSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";

export async function registerRoutes(app: Express): Promise<Server> {
  // API endpoint for shortening URLs
  app.post("/api/shorten", async (req: Request, res: Response) => {
    try {
      console.log("Received shorten request:", req.body);
      
      // Validate request body
      const validationResult = urlFormSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        const errorMessage = fromZodError(validationResult.error).message;
        console.error("Validation error:", errorMessage);
        return res.status(400).json({ message: errorMessage });
      }
      
      const { longUrl, customAlias } = validationResult.data;
      console.log("Validated data:", { longUrl, customAlias });
      
      // Create the short URL
      try {
        const url = await storage.createShortUrl(longUrl, customAlias);
        console.log("URL created successfully:", url);
        
        // Construct the full short URL
        const shortUrl = `${req.protocol}://${req.get("host")}/${url.shortCode}`;
        
        return res.status(201).json({
          id: url.id,
          shortCode: url.shortCode,
          longUrl: url.longUrl,
          shortUrl,
          createdAt: url.createdAt,
          clicks: url.clicks
        });
      } catch (storageError: any) {
        console.error("Storage error:", storageError);
        return res.status(500).json({ 
          message: "Database error while creating short URL",
          error: storageError.message
        });
      }
    } catch (error: any) {
      console.error("Unhandled error in /api/shorten:", error);
      return res.status(500).json({ 
        message: "Server error", 
        error: error.message || "Unknown error"
      });
    }
  });
  
  // API endpoint for redirecting short URLs
  app.get("/api/redirect/:shortCode", async (req: Request, res: Response) => {
    try {
      const { shortCode } = req.params;
      
      // Find the original URL
      const url = await storage.getUrlByShortCode(shortCode);
      
      if (!url) {
        return res.status(404).json({ message: "URL not found" });
      }
      
      // Increment click count asynchronously
      storage.incrementUrlClicks(shortCode).catch(console.error);
      
      return res.status(200).json({
        longUrl: url.longUrl
      });
    } catch (error) {
      return res.status(500).json({ message: "Server error" });
    }
  });
  
  // API endpoint for getting recent URLs
  app.get("/api/urls/recent", async (_req: Request, res: Response) => {
    try {
      const recentUrls = await storage.getRecentUrls(10);
      
      // Add full short URL to each URL
      const baseUrl = `${_req.protocol}://${_req.get("host")}`;
      const formattedUrls = recentUrls.map(url => ({
        ...url,
        shortUrl: `${baseUrl}/${url.shortCode}`
      }));
      
      return res.status(200).json(formattedUrls);
    } catch (error) {
      return res.status(500).json({ message: "Failed to fetch recent URLs" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
