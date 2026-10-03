import { paidOperationFailure, paidOperationKey, clearPaidOperationKey } from '@/utils/paidOperationFeedback';
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface RenewSingleConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
  connectionNumber: number;
  currentExpirationDate: string;
  onSuccess: () => void;
}

export const RenewSingleConnectionDialog = ({
  open,
  onOpenChange,
  customerId,
  customerName,
  connectionNumber,
  currentExpirationDate,
  onSuccess,
}: RenewSingleConnectionDialogProps) => {
  const { user } = useAuth();
  const [planDuration, setPlanDuration] = useState<string>("1");
  const [isLoading, setIsLoading] = useState(false);

  const isAdmin = user?.role === "admin";
  const creditsRequired = parseInt(planDuration);
  const hasEnoughCredits = isAdmin || (user?.credits ?? 0) >= creditsRequired;

  const handleRenewal = async () => {
    if (!user) {
      toast.error("Please log in to renew connections");
      return;
    }

    if (!hasEnoughCredits) {
      toast.error("Insufficient credits");
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("renew-single-connection", {
        body: {
          customerId,
          operationKey: paidOperationKey('single',customerId,parseInt(planDuration),connectionNumber),
          connectionNumber,
          planDuration: parseInt(planDuration),
        },
      });

      if (error) { let result; try { result = await error.context?.json(); } catch { /* Unknown outcome. */ } throw new Error(paidOperationFailure(result)); }

      if (data?.success) {
        const creditsUsedMsg = isAdmin 
          ? " (Admin Override - No Credits Used)"
          : ` using ${creditsRequired} credit${creditsRequired !== 1 ? 's' : ''}`;
        
        toast.success(
          `Connection ${connectionNumber} for ${customerName} renewed successfully${creditsUsedMsg}. New expiration: ${data.newExpirationDate}`
        );
        clearPaidOperationKey('single',customerId,parseInt(planDuration),connectionNumber);
        window.dispatchEvent(new CustomEvent('creditsUpdated'));
        onSuccess();
        onOpenChange(false);
      } else {
        throw new Error(data?.error || "Failed to renew connection");
      }
    } catch (error: any) {
      console.error("Error renewing connection:", error);
      toast.error(error.message || "Failed to renew connection");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Renew Single Connection
          </DialogTitle>
          <DialogDescription>
            Renew Connection {connectionNumber} for {customerName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">Connection:</span> #{connectionNumber}
            </div>
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">Current Expiration:</span>{" "}
              {new Date(currentExpirationDate).toLocaleDateString()}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="plan-duration">Plan Duration</Label>
            <Select value={planDuration} onValueChange={setPlanDuration}>
              <SelectTrigger id="plan-duration">
                <SelectValue placeholder="Select duration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 Month</SelectItem>
                <SelectItem value="3">3 Months</SelectItem>
                <SelectItem value="6">6 Months</SelectItem>
                <SelectItem value="12">12 Months</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span>Connections to renew:</span>
              <span className="font-medium">1</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Duration:</span>
              <span className="font-medium">{planDuration} month{planDuration !== "1" ? "s" : ""}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold pt-2 border-t">
              <span>Credits required:</span>
              <span className={isAdmin ? "text-green-600" : ""}>
                {isAdmin ? "0 (Admin Override)" : creditsRequired}
              </span>
            </div>
            {!isAdmin && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Your balance:</span>
                <span>{user?.credits ?? 0} credits</span>
              </div>
            )}
          </div>

          {!hasEnoughCredits && !isAdmin && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Insufficient credits. You need {creditsRequired} credits but have {user?.credits ?? 0}.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="flex gap-3 justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleRenewal}
            disabled={!hasEnoughCredits || isLoading}
          >
            {isLoading ? "Renewing..." : "Renew Connection"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
