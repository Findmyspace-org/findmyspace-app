"use client";

type Props = {
  spaceType: string;
  accessFilters: string[];
  securityFilters: string[];
  setAccessFilters: (filters: string[]) => void;
  setSecurityFilters: (filters: string[]) => void;
};

// 🔹 ICON MAPPING
const spaceTypeIcons: Record<string, string> = {
  parking: "/icons/parking.svg",
  storage: "/icons/storage.svg",
  office: "/icons/office.svg",
  garage: "/icons/garage.svg",
  workspace: "/icons/workspace.svg",
  other: "/icons/other.svg",
};

// 🔹 CATEGORY OPTIONS
const accessOptionsMap: Record<string, string[]> = {
  parking: ["covered", "open", "secure access"],
  storage: ["24/7 access", "ground floor", "drive-in"],
  office: ["wifi", "aircon", "meeting room"],
  garage: ["lockable", "electric door"],
  workspace: ["desk", "quiet", "shared"],
};

const securityOptionsMap: Record<string, string[]> = {
  parking: ["cctv", "gated", "security guard"],
  storage: ["alarm", "cctv", "secure lock"],
  office: ["access control", "reception"],
  garage: ["alarm", "cctv"],
  workspace: ["access control"],
};

export default function CategoryFilterPanel({
  spaceType,
  accessFilters,
  securityFilters,
  setAccessFilters,
  setSecurityFilters,
}: Props) {
  const accessOptions = accessOptionsMap[spaceType] || [];
  const securityOptions = securityOptionsMap[spaceType] || [];

  function toggleFilter(
    value: string,
    selected: string[],
    setter: (filters: string[]) => void
  ) {
    if (selected.includes(value)) {
      setter(selected.filter((item) => item !== value));
    } else {
      setter([...selected, value]);
    }
  }

  return (
    <div className="fms-card p-5 space-y-5">
      {/* HEADER WITH ICON */}
      <div className="flex items-center gap-2">
        {spaceTypeIcons[spaceType] && (
          <img
            src={spaceTypeIcons[spaceType]}
            alt={spaceType}
            className="h-5 w-5"
          />
        )}
        <h2 className="text-lg font-semibold capitalize text-[#0c1d2f]">
          {spaceType} filters
        </h2>
      </div>

      {/* ACCESS FILTERS */}
      {accessOptions.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-gray-600">Access</p>
          <div className="flex flex-wrap gap-2">
            {accessOptions.map((option) => {
              const active = accessFilters.includes(option);

              return (
                <button
                  key={option}
                  onClick={() =>
                    toggleFilter(option, accessFilters, setAccessFilters)
                  }
                  className={`fms-pill px-3 py-1 text-sm capitalize ${
                    active
                      ? "bg-[#0c1d2f] text-white"
                      : "bg-gray-100 text-[#0c1d2f]"
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* SECURITY FILTERS */}
      {securityOptions.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-gray-600">Security</p>
          <div className="flex flex-wrap gap-2">
            {securityOptions.map((option) => {
              const active = securityFilters.includes(option);

              return (
                <button
                  key={option}
                  onClick={() =>
                    toggleFilter(option, securityFilters, setSecurityFilters)
                  }
                  className={`fms-pill px-3 py-1 text-sm capitalize ${
                    active
                      ? "bg-[#0c1d2f] text-white"
                      : "bg-gray-100 text-[#0c1d2f]"
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}