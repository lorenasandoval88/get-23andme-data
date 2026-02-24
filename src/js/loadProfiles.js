import { fetch23andMeParticipants, fetchProfile } from './data/genomicData.js';

// Render table
function renderProfilesTable(profiles) {
    const container = document.getElementById('profilesTable');
    if (!container) return;

    const validProfiles = profiles.filter(p => p.profile);
    
    if (validProfiles.length === 0) {
        container.innerHTML = '<p class="text-muted">No profiles loaded</p>';
        return;
    }

    let html = `
        <table class="table table-striped table-hover">
            <thead class="table-dark">
                <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>State</th>
                    <th>Sex</th>
                    <th>Profile</th>
                    <th>23andMe File</th>
                </tr>
            </thead>
            <tbody>
    `;

    for (const { id, profile } of validProfiles) {
        const name = profile.real_name || profile.username || 'N/A';
        const state = profile.state || 'N/A';
        const sex = profile.sex || 'N/A';
        const profileUrl = `https://my.pgp-hms.org/profile/${id}`;
        
        // Find 23andMe file from profile.files
        const files = profile.files || [];
        const file23andMe = files.find(f => 
            (f.data_type && f.data_type.toLowerCase().includes('23andme')) ||
            (f.name && f.name.toLowerCase().includes('23andme'))
        );
        const fileLink = file23andMe && file23andMe.download_url 
            ? `<a href=${file23andMe.download_url} target="_blank">Download</a>`
            : 'N/A';

        html += `
            <tr>
                <td><code>${id}</code></td>
                <td>${name}</td>
                <td>${state}</td>
                <td>${sex}</td>
                <td><a href="${profileUrl}" target="_blank">View</a></td>
                <td>${fileLink}</td>
            </tr>
        `;
        console.log("file url:",file23andMe.download_url )
    }
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

async function loadProfiles() {
    const container = document.getElementById('profilesTable');
    if (container) container.innerHTML = 'Loading profiles...';

    try {
        const participants = await fetch23andMeParticipants();
        const participants_ids = [...new Set(participants.map(p => p.id))].slice(0, 10);
        console.log("Fetching profiles for:", participants_ids);

        const profiles = await Promise.all(
            participants_ids.map(async (id) => {
                try {
                    const profile = await fetchProfile(id);
                    return { id, profile, error: null };
                } catch (error) {
                    return { id, profile: null, error: error.message };
                }
            })
        );

        console.log("Profiles:", profiles);
        renderProfilesTable(profiles);
    } catch (error) {
        if (container) container.innerHTML = `<p class="text-danger">Error: ${error.message}</p>`;
    }
}

export { loadProfiles, renderProfilesTable };