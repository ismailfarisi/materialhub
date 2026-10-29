import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const iconMap: Record<string, string> = {
  LayoutDashboard: 'SquaresFour',
  Package: 'Package',
  ShoppingCart: 'ShoppingCart',
  Settings: 'Gear',
  Wallet: 'Wallet',
  BarChart3: 'ChartBar',
  BarChart: 'ChartBar',
  Gavel: 'Gavel',
  RotateCcw: 'ArrowCounterClockwise',
  Tag: 'Tag',
  Zap: 'Lightning',
  Sparkles: 'Sparkle',
  Truck: 'Truck',
  Upload: 'UploadSimple',
  FileText: 'FileText',
  Plus: 'Plus',
  ChevronDown: 'CaretDown',
  ChevronRight: 'CaretRight',
  ChevronLeft: 'CaretLeft',
  ChevronUp: 'CaretUp',
  Search: 'MagnifyingGlass',
  X: 'X',
  Check: 'Check',
  AlertCircle: 'WarningCircle',
  Info: 'Info',
  MoreHorizontal: 'DotsThree',
  MoreVertical: 'DotsThreeVertical',
  ExternalLink: 'ArrowSquareOut',
  Copy: 'Copy',
  Trash: 'Trash',
  Edit: 'Pencil',
  Eye: 'Eye',
  EyeOff: 'EyeSlash',
  Download: 'DownloadSimple',
  RefreshCw: 'ArrowClockwise',
  Filter: 'Funnel',
  LogOut: 'SignOut',
  User: 'User',
  Users: 'Users',
  Bell: 'Bell',
  HelpCircle: 'Question',
  ArrowUpDown: 'ArrowsDownUp',
  Store: 'Storefront',
  Trash2: 'Trash',
  Building2: 'Buildings',
  Layers: 'Stack',
  Loader2: 'Spinner',
  GripVertical: 'DotsSixVertical',
  Bold: 'TextB',
  Italic: 'TextItalic',
  Heading2: 'TextHTwo',
  Heading3: 'TextHThree',
  IconWeights: 'IconWeight',
  ListOrdered: 'ListNumbers',
  Quote: 'Quotes',
  PanelLeftClose: 'CaretLeft',
  PanelLeftOpen: 'CaretRight',
  StickyNote: 'StickyNote',
  Box: 'Cube',
  Calendar: 'Calendar',
  Chevron: 'Caret',
  List: 'List',
  Menu: 'List',
  Star: 'Star',
  StarHalf: 'StarHalf',
  Minus: 'Minus',
  PlusCircle: 'PlusCircle',
  MinusCircle: 'MinusCircle',
  AlertTriangle: 'Warning',
  CheckCircle: 'CheckCircle',
  XCircle: 'XCircle',
  InfoCircle: 'Info',
  Loader: 'Spinner',
  Clock: 'Clock',
  MapPin: 'MapPin',
  Phone: 'Phone',
  Mail: 'Envelope',
  Link: 'Link',
  Image: 'Image',
  Video: 'Video',
  Music: 'Music',
  File: 'File',
  Folder: 'Folder',
  Archive: 'Archive',
  Unlock: 'Unlock',
  Lock: 'Lock',
  Shield: 'Shield',
  TrendingUp: 'TrendUp',
  TrendingDown: 'TrendDown',
  DollarSign: 'CurrencyDollar',
  CreditCard: 'CreditCard',
  Building: 'Building',
  Home: 'House',
  ArrowRight: 'ArrowRight',
  ArrowLeft: 'ArrowLeft',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  CornerDownLeft: 'ArrowDownLeft',
  CornerDownRight: 'ArrowDownRight',
  CornerUpLeft: 'ArrowUpLeft',
  CornerUpRight: 'ArrowUpRight',
};

function migrateFile(filePath: string): void {
  let content = readFileSync(filePath, 'utf-8');

  // Replace lucide-react imports with @phosphor-icons/react
  content = content.replace(
    /from ["']lucide-react["']/g,
    'from "@phosphor-icons/react"'
  );

  // Replace icon names everywhere (imports, JSX, usage)
  for (const [lucide, phosphor] of Object.entries(iconMap)) {
    // Word boundary to avoid partial matches
    const regex = new RegExp(`\\b${lucide}\\b`, 'g');
    content = content.replace(regex, phosphor);
  }

  writeFileSync(filePath, content);
  console.log(`Migrated: ${filePath}`);
}

function walkDir(dir: string): void {
  const files = readdirSync(dir, { withFileTypes: true });

  for (const file of files) {
    const fullPath = join(dir, file.name);

    if (file.isDirectory()) {
      // Skip node_modules and .next
      if (file.name !== 'node_modules' && file.name !== '.next' && file.name !== 'dist') {
        walkDir(fullPath);
      }
    } else if (file.name.endsWith('.tsx') || file.name.endsWith('.ts')) {
      migrateFile(fullPath);
    }
  }
}

// Migrate packages/ui and apps/vendor-dashboard
console.log('Migrating packages/ui...');
walkDir('packages/ui/src');

console.log('\nMigrating apps/vendor-dashboard...');
walkDir('apps/vendor-dashboard/src');

console.log('\n✅ Icon migration complete!');
