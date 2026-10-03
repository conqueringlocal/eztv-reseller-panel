import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyText } from "./CopyText";
import type { SalesPage } from "@/lib/sales";
const guides = [
  {
    title: "Before starting a trial",
    text: "Please send your device model and the name of the app you plan to use. I’ll confirm compatibility and the right setup method before starting your trial. Set aside time to try it while the trial is active. Any separate app licence or device cost will be confirmed before you pay.",
  },
  {
    title: "Set up the approved player",
    text: "Open the player we agreed on and select the login method I supplied. If using server / username / password, enter all three exactly as sent. If using an M3U link, paste the complete link without adding spaces. Do not mix the two methods. Keep your login private. Let me know when the channel list has loaded.",
  },
  {
    title: "Check the trial worked",
    text: "Were you able to open the app and start watching? Please try it on the device and internet connection you normally use. If something fails, send the app name, device model, exact error and approximate time. Hide your password and full playlist link in screenshots.",
  },
  {
    title: "Troubleshoot buffering or login issues",
    text: "First check whether another app on the same device can access the internet. Close and reopen the player, then restart the device if needed. Check for device and app updates. Tell me whether the issue affects one channel or everything, and whether you see an error. Please contact me before deleting your settings or trying repeated account activations.",
  },
  {
    title: "Explain connections clearly",
    text: "Your subscription includes the number of simultaneous connections we agreed on. Let me know before adding another device for simultaneous viewing, so I can confirm the connection allowance, price and setup. Installing a player does not add a connection to your subscription.",
  },
  {
    title: "Answer a price question",
    text: "The price depends on how many simultaneous connections you need and the subscription length. Tell me your device and preferred duration, and I’ll send a clear total price. I can help with setup and explain any separate player licence before you decide.",
  },
];
export function SetupKit({ page }: { page: SalesPage | null }) {
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Customer setup & sales kit</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Review and personalize these messages before sharing. Confirm the
            customer’s device and your supported player first. These guides do
            not contain customer credentials.
          </p>
          <p className="text-sm">
            Add your approved app instructions and tutorial link in{" "}
            <Link className="underline" to="/reseller/sales?tab=page">
              Page & setup settings
            </Link>
            .
          </p>
          {page?.setup_notes && (
            <div className="rounded border p-4">
              <h3 className="font-semibold mb-2">Your setup instructions</h3>
              <p className="whitespace-pre-wrap text-sm mb-3">
                {page.setup_notes}
              </p>
              <CopyText
                text={page.setup_notes}
                label="Copy your setup instructions"
              />
            </div>
          )}
          {page?.tutorial_url && (
            <a
              className="inline-block underline"
              href={page.tutorial_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open your tutorial video / guide
            </a>
          )}
        </CardContent>
      </Card>
      <div className="grid md:grid-cols-2 gap-5">
        {guides.map((g) => (
          <Card key={g.title}>
            <CardHeader>
              <CardTitle className="text-lg">{g.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">{g.text}</p>
              <CopyText text={g.text} />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Device help & reseller checklist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Official device guidance:{" "}
            <a
              className="underline"
              href="https://support.google.com/googletv/answer/12364830?hl=en"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google TV restart and app updates
            </a>{" "}
            ·{" "}
            <a
              className="underline"
              href="https://www.aboutamazon.com/news/devices/amazon-fire-tv-stick"
              target="_blank"
              rel="noopener noreferrer"
            >
              Amazon Fire TV getting started
            </a>
            . This does not establish compatibility with a particular player or
            service.
          </p>
          <ol className="list-decimal pl-5 space-y-2">
            <li>Configure your customer contact details and branding.</li>
            <li>Learn the approved setup and troubleshooting steps.</li>
            <li>Record a lead and its next follow-up.</li>
            <li>Check the margin before offering a price or reward.</li>
            <li>Review trial outcomes and renewals each day.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
