import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import FollowUpList from '../followups/FollowUpList.jsx';
import ActivityTimeline from './ActivityTimeline.jsx';

// Activities and follow-ups of one record, one above the other - for pages that
// show both in a single place.
//
//   <RecordEngagement type="contact" id={contact.id} />
//
// `type` is a relation type the API knows: company | contact | lead |
// opportunity | customer | project | ticket | contract.
export default function RecordEngagement({ type, id }) {
  return (
    <Stack spacing={3}>
      <section>
        <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
          Activities
        </Typography>
        <ActivityTimeline related={{ [`${type}Id`]: id }} />
      </section>
      <Divider />
      <section>
        <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
          Follow-ups
        </Typography>
        <FollowUpList relatedType={type} relatedId={id} />
      </section>
    </Stack>
  );
}
