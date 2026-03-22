import { Invoice } from '@/types/revenant';
import DIEBadge from './DIEBadge';
import RecoveryScore from './RecoveryScore';

interface WarRoomBoardProps {
  highValue: Invoice[];
  standard: Invoice[];
  lowPriority: Invoice[];
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

interface ColumnConfig {
  title: string;
  borderColor: string;
  badgeBg: string;
  badgeText: string;
}

const columns: ColumnConfig[] = [
  {
    title: 'HIGH VALUE',
    borderColor: '#DC2626',
    badgeBg: '#FEE2E2',
    badgeText: '#DC2626',
  },
  {
    title: 'STANDARD',
    borderColor: '#CA8A04',
    badgeBg: '#FEF9C3',
    badgeText: '#CA8A04',
  },
  {
    title: 'LOW PRIORITY',
    borderColor: '#9CA3AF',
    badgeBg: '#F3F4F6',
    badgeText: '#6B7280',
  },
];

interface InvoiceCardProps {
  invoice: Invoice;
  borderColor: string;
}

function InvoiceCard({ invoice, borderColor }: InvoiceCardProps) {
  const displayName = invoice.customerName || invoice.customerEmail || invoice.stripeCustomerId;
  const displayEmail = invoice.customerName ? invoice.customerEmail : undefined;

  return (
    <div
      className="bg-white rounded-lg p-4 flex flex-col gap-2"
      style={{
        boxShadow: '0 1px 3px #00000010',
        border: '1px solid #F0EDE8',
        borderLeft: `4px solid ${borderColor}`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col min-w-0">
          <span className="text-[13px] font-semibold text-[#1A1A1A] truncate">{displayName}</span>
          {displayEmail && (
            <span className="text-[11px] text-[#9CA3AF] truncate">{displayEmail}</span>
          )}
        </div>
        <span className="text-[13px] font-bold text-[#1A1A1A] whitespace-nowrap">
          {formatCurrency(invoice.amount)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        {invoice.dieCategory && <DIEBadge category={invoice.dieCategory} />}
        {invoice.recoveryScore !== undefined && (
          <RecoveryScore score={invoice.recoveryScore} />
        )}
      </div>
    </div>
  );
}

interface BoardColumnProps {
  config: ColumnConfig;
  invoices: Invoice[];
}

function BoardColumn({ config, invoices }: BoardColumnProps) {
  return (
    <div className="flex flex-col gap-3 flex-1 min-w-0">
      {/* Column header */}
      <div className="flex items-center gap-2">
        <span
          className="text-[10px] font-medium uppercase tracking-[0.8px]"
          style={{ color: config.borderColor }}
        >
          {config.title}
        </span>
        <span
          className="inline-flex items-center justify-center rounded-full w-5 h-5 text-[10px] font-bold"
          style={{ backgroundColor: config.badgeBg, color: config.badgeText }}
        >
          {invoices.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2">
        {invoices.length === 0 ? (
          <div className="text-[12px] text-[#9CA3AF] text-center py-6">No invoices</div>
        ) : (
          invoices.map((invoice) => (
            <InvoiceCard
              key={invoice._id}
              invoice={invoice}
              borderColor={config.borderColor}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default function WarRoomBoard({ highValue, standard, lowPriority }: WarRoomBoardProps) {
  const allInvoices = [highValue, standard, lowPriority];

  return (
    <div className="flex gap-4">
      {columns.map((col, idx) => (
        <BoardColumn key={col.title} config={col} invoices={allInvoices[idx]} />
      ))}
    </div>
  );
}
