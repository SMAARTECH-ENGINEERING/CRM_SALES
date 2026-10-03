import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ContactForm from '../components/contacts/ContactForm.jsx';

// /contacts/new - optionally /contacts/new?companyId=<id> to preselect the company.
export default function ContactNewPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const companyId = searchParams.get('companyId') ?? '';

  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/contacts'));

  return (
    <Stack spacing={2} sx={{ maxWidth: 900 }}>
      <Typography variant="h4" component="h1">
        New contact
      </Typography>
      <Card>
        <CardContent>
          <ContactForm
            initialCompanyId={companyId}
            onCancel={goBack}
            onSaved={(contact) => navigate(`/contacts/${contact.id}`, { replace: true })}
          />
        </CardContent>
      </Card>
    </Stack>
  );
}
