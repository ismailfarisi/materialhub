// Utility
export { cn } from "./lib/utils";

// Primitives
export { Button, buttonVariants } from "./components/ui/button";
export type { ButtonProps } from "./components/ui/button";

export { Input } from "./components/ui/input";
export type { InputProps } from "./components/ui/input";

export { Textarea } from "./components/ui/textarea";
export type { TextareaProps } from "./components/ui/textarea";

export { Label } from "./components/ui/label";

export { Badge, badgeVariants } from "./components/ui/badge";
export type { BadgeProps } from "./components/ui/badge";

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from "./components/ui/card";

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "./components/ui/table";

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "./components/ui/dialog";

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
} from "./components/ui/dropdown-menu";

export {
  Select,
  SimpleSelect,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
} from "./components/ui/select";

export { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs";

export { ConfirmDialog } from "./components/ui/confirm-dialog";
export type { ConfirmDialogProps } from "./components/ui/confirm-dialog";

export {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "./components/ui/toast";
export type { ToastProps, ToastActionElement } from "./components/ui/toast";

export { Toaster } from "./components/ui/toaster";
export { useToast, toast } from "./components/ui/use-toast";

export { Avatar, AvatarImage, AvatarFallback } from "./components/ui/avatar";

export { Separator } from "./components/ui/separator";

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from "./components/ui/sheet";

export { Skeleton } from "./components/ui/skeleton";

export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "./components/ui/tooltip";

export {
  Popover,
  PopoverTrigger,
  PopoverAnchor,
  PopoverContent,
} from "./components/ui/popover";

export { Calendar } from "./components/ui/calendar";
export type { CalendarProps } from "./components/ui/calendar";

export { Checkbox } from "./components/ui/checkbox";

export { Switch } from "./components/ui/switch";

export { ScrollArea, ScrollBar } from "./components/ui/scroll-area";

export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
} from "./components/ui/form";

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "./components/ui/pagination";

// Dashboard composites
export { Sidebar } from "./components/dashboard/sidebar";
export { DashboardHeader } from "./components/dashboard/header";
export { ChangePasswordDialog } from "./components/dashboard/change-password-dialog";
export type { ChangePasswordDialogProps } from "./components/dashboard/change-password-dialog";
export { StatCard } from "./components/dashboard/stat-card";
export { DataTable } from "./components/dashboard/data-table";
export { StatusBadge } from "./components/dashboard/status-badge";
export { FiltersBar } from "./components/dashboard/filters-bar";
export { EmptyState } from "./components/dashboard/empty-state";

// Form components
export { ImageUploader } from "./components/forms/image-uploader";
export { S3ImageUploadField } from "./components/forms/s3-image-upload-field";
export type { S3ImageUploadFieldProps } from "./components/forms/s3-image-upload-field";
export { S3FileField } from "./components/forms/s3-file-field";
export type {
  S3FileEntry,
  S3FileFieldProps,
} from "./components/forms/s3-file-field";
export { RichEditor } from "./components/forms/rich-editor";

// Product editors
export { EditorialEditor } from "./components/products/editorial-editor";
export type {
  EditorialEditorProps,
  ProductEditorial,
} from "./components/products/editorial-editor";

export {
  ProductAttributesEditor,
  serializeProductAttributes,
  missingRequiredAttributes,
  hydrateProductAttributes,
  splitCategoryAttributes,
} from "./components/products/product-attributes-editor";
export type {
  ProductAttributesEditorProps,
  ProductAttributeDraft,
  CategoryAttributeLink,
  AttributeValueOption,
} from "./components/products/product-attributes-editor";

export {
  VariantMatrixEditor,
  variantCombinations,
  buildVariantRowsPayload,
  minVariantPriceFils,
  rowsMissingPrice,
  existingVariantKeys,
  comboKeyOf,
  slugifyAxisName,
  EMPTY_VARIANT_MATRIX,
  MAX_VARIANT_COMBINATIONS,
} from "./components/products/variant-matrix-editor";
export type {
  VariantMatrixEditorProps,
  VariantMatrixValue,
  VariantAxisDraft,
  VariantAxisValue,
  VariantRowDraft,
  VariantCombination,
  ExplicitVariantRow,
} from "./components/products/variant-matrix-editor";

// Media Manager
export { MediaManager } from "./components/products/media-manager";
export type {
  MediaItem,
  ImageMediaItem,
  VideoMediaItem,
  MediaActions,
  MediaManagerProps,
  CropRect,
  FocalPoint,
  Capability,
} from "./components/products/media-manager/types";

// Icons
export * from "./components/icons/icon-adapter";

// Hooks
export { useDebounce } from "./hooks/use-debounce";
export { useKeyboardViewport } from "./hooks/use-keyboard-viewport";
export type { KeyboardViewport } from "./hooks/use-keyboard-viewport";
export { usePagination } from "./hooks/use-pagination";
export { useS3Upload } from "./hooks/use-s3-upload";
export type {
  S3UploadClient,
  PresignResponse,
  MediaAssetType,
  UploadResult,
} from "./hooks/use-s3-upload";

// Filters
export * from "./filters/index";

// CMS Editor (LayoutEditor, SectionConfigEditor)
export { LayoutEditor, SectionConfigEditor } from "./components/cms";
export type {
  LayoutEditorProps,
  LayoutEditorMode,
  Section,
  SectionType,
  Layout,
} from "./components/cms";

// Promotions
export { DealPreviewCard } from "./components/promotions";
export type { DealPreviewCardProps } from "./components/promotions";
