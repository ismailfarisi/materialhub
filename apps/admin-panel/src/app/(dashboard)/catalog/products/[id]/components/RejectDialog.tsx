import {
  Button, Textarea,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@materialhub/ui";

interface RejectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rejectReason: string;
  setRejectReason: (v: string) => void;
  onSubmit: () => void;
  rejecting: boolean;
}

export function RejectDialog({ open, onOpenChange, rejectReason, setRejectReason, onSubmit, rejecting }: RejectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject Product</DialogTitle>
        </DialogHeader>
        <div>
          <label className="block text-sm font-medium text-cacao mb-1">Reason *</label>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Explain why this product is being rejected..."
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={onSubmit} disabled={!rejectReason.trim() || rejecting}>
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
