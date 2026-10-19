-- The file import source belongs to the manufacturer's own team now.
update public.sources
set name = 'File import (CSV)',
    lawful_basis = 'Buyer lists supplied by the manufacturer from its own lawful business records for B2B outreach; DPDP s.7 legitimate use. Each import records where the list came from.',
    terms_note = 'Every import requires a note on the origin of the list. No purchased consumer lists.'
where adapter = 'csv_upload';
