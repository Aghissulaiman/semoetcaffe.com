import Link from "next/link";

interface BreadcrumbProps {
  pageTitle: string;
  items?: { label: string; href?: string }[];
}

/**
 * Judul halaman + breadcrumb.
 */
const PageBreadcrumb: React.FC<BreadcrumbProps> = ({ pageTitle, items = [] }) => {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold text-coffee-espresso dark:text-coffee-cream">
        {pageTitle}
      </h2>
      <nav>
        <ol className="flex items-center gap-1.5">
          <li>
            <Link
              className="inline-flex items-center gap-1.5 text-sm text-coffee-muted transition-colors hover:text-coffee-brown dark:text-coffee-cream/60 dark:hover:text-coffee-caramel"
              href="/"
            >
              Beranda
              <svg
                className="stroke-current rtl:rotate-180"
                width="17"
                height="16"
                viewBox="0 0 17 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M6.0765 12.667L10.2432 8.50033L6.0765 4.33366"
                  stroke=""
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          </li>
          {items.map((item) => (
            <li key={item.label} className="flex items-center gap-1.5">
              {item.href ? (
                <Link
                  className="text-sm text-coffee-muted transition-colors hover:text-coffee-brown dark:text-coffee-cream/60 dark:hover:text-coffee-caramel"
                  href={item.href}
                >
                  {item.label}
                </Link>
              ) : (
                <span className="text-sm text-coffee-brown dark:text-coffee-caramel">
                  {item.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
};

export default PageBreadcrumb;
