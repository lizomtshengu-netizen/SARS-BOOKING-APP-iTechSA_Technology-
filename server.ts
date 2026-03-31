import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import cron from "node-cron";
import { collection, query, where, getDocs, updateDoc, doc } from "firebase/firestore";
import { db } from "./src/firebase.js";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for Bookings
  app.post("/api/bookings", async (req, res) => {
    const { booking, userEmail } = req.body;

    try {
      // 1. Send Email Notification
      // Note: In a real app, you'd use SMTP credentials from process.env
      // For this demo, we'll log the email sending and provide the structure
      const transporter = nodemailer.createTransport({
        // Placeholder for real SMTP configuration
        // host: process.env.SMTP_HOST,
        // port: Number(process.env.SMTP_PORT),
        // secure: true,
        // auth: {
        //   user: process.env.SMTP_USER,
        //   pass: process.env.SMTP_PASS,
        // },
        // Using a mock/json transport for demonstration if no credentials exist
        jsonTransport: true
      });

      const mailOptions = {
        from: '"SARS BOOKING SYSTEM" <noreply@sars-bookings.run.app>',
        to: "lizomtshengu@gmail.com",
        subject: `NEW SARS BOOKING: ${booking.serviceName}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #003B5C; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">New Appointment Request</h1>
            </div>
            <div style="padding: 20px; color: #374151;">
              <p>A new booking has been received from <strong>${userEmail}</strong>.</p>
              <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Service:</td>
                  <td style="padding: 8px 0; font-weight: bold;">${booking.serviceName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Branch:</td>
                  <td style="padding: 8px 0; font-weight: bold;">${booking.branch}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Date:</td>
                  <td style="padding: 8px 0; font-weight: bold;">${new Date(booking.date).toLocaleDateString()}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Time:</td>
                  <td style="padding: 8px 0; font-weight: bold;">${new Date(booking.date).toLocaleTimeString()}</td>
                </tr>
              </table>
              <div style="margin-top: 30px; padding: 15px; background-color: #f9fafb; border-radius: 6px; font-size: 12px; color: #9ca3af;">
                This booking is currently pending review prior to linking to the SARS system.
              </div>
            </div>
          </div>
        `
      };

      // In a real scenario with SMTP, this would send the actual email
      const info = await transporter.sendMail(mailOptions);
      console.log("Booking email notification processed:", info.message);

      res.status(200).json({ success: true, message: "Booking notification sent successfully." });
    } catch (error) {
      console.error("Error processing booking email:", error);
      res.status(500).json({ success: false, error: "Failed to process booking notification." });
    }
  });

  app.post("/api/rejections", async (req, res) => {
    const { appointment, reason, userEmail } = req.body;

    try {
      const transporter = nodemailer.createTransport({
        jsonTransport: true
      });

      const mailOptions = {
        from: '"SARS BOOKING SYSTEM" <noreply@sars-bookings.run.app>',
        to: userEmail,
        subject: `APPOINTMENT REJECTED: ${appointment.serviceName}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #dc2626; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">Appointment Rejected</h1>
            </div>
            <div style="padding: 20px; color: #374151;">
              <p>Dear User,</p>
              <p>Your appointment request has been rejected for the following reason:</p>
              <div style="padding: 15px; background-color: #fef2f2; border-left: 4px solid #dc2626; margin: 20px 0; color: #991b1b;">
                ${reason}
              </div>
              <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Service:</td>
                  <td style="padding: 8px 0; font-weight: bold;">${appointment.serviceName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Branch:</td>
                  <td style="padding: 8px 0; font-weight: bold;">${appointment.branch}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Date:</td>
                  <td style="padding: 8px 0; font-weight: bold;">${new Date(appointment.date).toLocaleDateString()}</td>
                </tr>
              </table>
              <p style="margin-top: 20px;">Please feel free to book another appointment at a different time.</p>
            </div>
          </div>
        `
      };

      const info = await transporter.sendMail(mailOptions);
      console.log("Rejection email notification processed:", info.message);

      res.status(200).json({ success: true, message: "Rejection notification sent successfully." });
    } catch (error) {
      console.error("Error processing rejection email:", error);
      res.status(500).json({ success: false, error: "Failed to process rejection notification." });
    }
  });

  app.post("/api/cancellations", async (req, res) => {
    const { appointment, reason, userEmail } = req.body;

    try {
      const transporter = nodemailer.createTransport({
        jsonTransport: true
      });

      const mailOptions = {
        from: '"SARS BOOKING SYSTEM" <noreply@sars-bookings.run.app>',
        to: userEmail,
        subject: `APPOINTMENT CANCELLED: ${appointment.serviceName}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #f97316; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">Appointment Cancelled</h1>
            </div>
            <div style="padding: 20px; color: #374151;">
              <p>Dear User,</p>
              <p>Your appointment has been cancelled by the administrator for the following reason:</p>
              <div style="padding: 15px; background-color: #fff7ed; border-left: 4px solid #f97316; margin: 20px 0; color: #9a3412;">
                ${reason}
              </div>
              <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Service:</td>
                  <td style="padding: 8px 0; font-weight: bold;">${appointment.serviceName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Branch:</td>
                  <td style="padding: 8px 0; font-weight: bold;">${appointment.branch}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Date:</td>
                  <td style="padding: 8px 0; font-weight: bold;">${new Date(appointment.date).toLocaleDateString()}</td>
                </tr>
              </table>
              <p style="margin-top: 20px;">We apologize for any inconvenience caused. Please feel free to book another appointment.</p>
            </div>
          </div>
        `
      };

      const info = await transporter.sendMail(mailOptions);
      console.log("Cancellation email notification processed:", info.message);

      res.status(200).json({ success: true, message: "Cancellation notification sent successfully." });
    } catch (error) {
      console.error("Error processing cancellation email:", error);
      res.status(500).json({ success: false, error: "Failed to process cancellation notification." });
    }
  });

  app.post("/api/support", async (req, res) => {
    const { name, email, subject, message } = req.body;

    try {
      const transporter = nodemailer.createTransport({
        jsonTransport: true
      });

      const mailOptions = {
        from: '"SARS BOOKING SYSTEM" <noreply@sars-bookings.run.app>',
        to: "lizomtshengu@gmail.com",
        subject: `SUPPORT REQUEST: ${subject}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #003B5C; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">New Support Request</h1>
            </div>
            <div style="padding: 20px; color: #374151;">
              <p>You have received a new support request from <strong>${name} (${email})</strong>.</p>
              <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
              <p><strong>Subject:</strong> ${subject}</p>
              <p><strong>Message:</strong></p>
              <div style="padding: 15px; background-color: #f9fafb; border-radius: 6px; color: #374151;">
                ${message}
              </div>
            </div>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      res.status(200).json({ success: true, message: "Support request sent successfully." });
    } catch (error) {
      console.error("Error processing support request:", error);
      res.status(500).json({ success: false, error: "Failed to process support request." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // --- Appointment Reminders ---
  // Run every hour
  cron.schedule("0 * * * *", async () => {
    console.log("Checking for upcoming appointments (24h reminders)...");
    
    try {
      const now = new Date();
      const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const twentyFiveHoursFromNow = new Date(now.getTime() + 25 * 60 * 60 * 1000);

      const q = query(
        collection(db, "appointments"),
        where("status", "==", "scheduled"),
        where("reminderSent", "==", false)
      );

      const snapshot = await getDocs(q);
      
      for (const appointmentDoc of snapshot.docs) {
        const appointment = appointmentDoc.data();
        const appointmentDate = new Date(appointment.date);

        // Check if appointment is within the 24-25 hour window from now
        if (appointmentDate >= twentyFourHoursFromNow && appointmentDate <= twentyFiveHoursFromNow) {
          console.log(`Sending reminder for appointment: ${appointmentDoc.id}`);

          const transporter = nodemailer.createTransport({
            jsonTransport: true // Using demo transport as per existing pattern
          });

          const userMailOptions = {
            from: '"SARS BOOKING SYSTEM" <noreply@sars-bookings.run.app>',
            to: appointment.userEmail,
            subject: `REMINDER: Your SARS Appointment is Tomorrow`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                <div style="background-color: #003B5C; color: white; padding: 20px; text-align: center;">
                  <h1 style="margin: 0; font-size: 24px;">Appointment Reminder</h1>
                </div>
                <div style="padding: 20px; color: #374151;">
                  <p>Dear ${appointment.userName || 'User'},</p>
                  <p>This is a reminder for your upcoming SARS appointment scheduled for tomorrow.</p>
                  <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 8px 0; color: #6b7280;">Service:</td>
                      <td style="padding: 8px 0; font-weight: bold;">${appointment.serviceName}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; color: #6b7280;">Branch:</td>
                      <td style="padding: 8px 0; font-weight: bold;">${appointment.branch}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; color: #6b7280;">Date:</td>
                      <td style="padding: 8px 0; font-weight: bold;">${new Date(appointment.date).toLocaleDateString()}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; color: #6b7280;">Time:</td>
                      <td style="padding: 8px 0; font-weight: bold;">${new Date(appointment.date).toLocaleTimeString()}</td>
                    </tr>
                  </table>
                  <p style="margin-top: 20px;">We look forward to seeing you.</p>
                </div>
              </div>
            `
          };

          const adminMailOptions = {
            from: '"SARS BOOKING SYSTEM" <noreply@sars-bookings.run.app>',
            to: "lizomtshengu@gmail.com",
            subject: `ADMIN REMINDER: Upcoming Appointment - ${appointment.userName}`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                <div style="background-color: #F2A900; color: #003B5C; padding: 20px; text-align: center;">
                  <h1 style="margin: 0; font-size: 24px;">Upcoming Appointment Notification</h1>
                </div>
                <div style="padding: 20px; color: #374151;">
                  <p>The following appointment is scheduled for tomorrow:</p>
                  <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 8px 0; color: #6b7280;">User:</td>
                      <td style="padding: 8px 0; font-weight: bold;">${appointment.userName} (${appointment.userEmail})</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; color: #6b7280;">Service:</td>
                      <td style="padding: 8px 0; font-weight: bold;">${appointment.serviceName}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; color: #6b7280;">Branch:</td>
                      <td style="padding: 8px 0; font-weight: bold;">${appointment.branch}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; color: #6b7280;">Date:</td>
                      <td style="padding: 8px 0; font-weight: bold;">${new Date(appointment.date).toLocaleDateString()}</td>
                    </tr>
                  </table>
                </div>
              </div>
            `
          };

          await transporter.sendMail(userMailOptions);
          await transporter.sendMail(adminMailOptions);

          // Mark as sent
          await updateDoc(doc(db, "appointments", appointmentDoc.id), {
            reminderSent: true
          });
        }
      }
    } catch (error) {
      console.error("Error in reminder cron job:", error);
    }
  });
}

startServer();
