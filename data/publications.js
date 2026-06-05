/* ============================================================
   PUBLICATIONS  —  edit this file to add or update papers
   ============================================================

   Each entry shape:
   {
     year:     "2024",          // publication year (string)
     title:    "My paper",      // full title
     authors:  "A. Name et al.",
     venue:    "Journal / Conference",
     url:      "https://…",     // optional; omit or set "" to suppress link
     featured: true             // optional; shown in the homepage section
   }

   The most recent papers should appear first. Entries with `featured: true`
   surface in the homepage "Selected Work" section; the full list (this whole
   array) is rendered on publications.html. Both pages are server-rendered into
   static HTML by `npm run generate-cards`, then hydrated by js/main.js.

   `url` points at the canonical publisher page (DOI where available). A handful
   of older workshop papers / abstracts have no official online record and are
   intentionally left without a link.
   ============================================================ */

export const PUBLICATIONS = [
    {
        year: '2024',
        title: 'A collaborative AR application for education: from architecture design to user evaluation',
        authors: 'S. Masneri, A. Domínguez, G. Pacho, M. Zorrilla, M. Larrañaga, A. Arruarte',
        venue: 'Virtual Reality (Springer), Vol. 28',
        url: 'https://doi.org/10.1007/s10055-024-00952-x',
        featured: true,
    },
    {
        year: '2024',
        title: 'An innovative adaptive Web-based solution for improved remote co-creation and delivery of artistic performances',
        authors: 'M. A. Togou, A. A. Simiscuka, R. Verma, N. E. O’Connor, I. Tamayo, S. Masneri, M. Zorrilla, G.-M. Muntean',
        venue: 'IEEE Transactions on Broadcasting, Vol. 70(2)',
        url: 'https://doi.org/10.1109/TBC.2024.3363455',
    },
    {
        year: '2024',
        title: 'A novel architecture for collaborative augmented reality experiences for education',
        authors: 'S. Masneri',
        venue: 'PhD Thesis, University of the Basque Country (UPV/EHU)',
        url: 'https://addi.ehu.eus/handle/10810/68721',
    },
    {
        year: '2023',
        title: 'cleAR: an interoperable architecture for multi-user AR-based school curricula',
        authors: 'S. Masneri, A. Domínguez, M. Sanz, M. Zorrilla, M. Larrañaga, A. Arruarte',
        venue: 'Virtual Reality (Springer), Vol. 27(3)',
        url: 'https://doi.org/10.1007/s10055-023-00764-5',
        featured: true,
    },
    {
        year: '2023',
        title: 'Dataset of user interactions across four large pilots on the use of augmented reality in learning experiences',
        authors: 'A. Domínguez, G. Pacho, L. Bowers, F. Wild, S. Alcock, G. Chiazzese, M. Farella, M. Arrigo, D. Ross, R. Treacy, et al.',
        venue: 'Scientific Data (Nature), Vol. 10',
        url: 'https://doi.org/10.1038/s41597-023-02743-6',
    },
    {
        year: '2022',
        title: 'Interactive, Collaborative and Multi-user Augmented Reality Applications in Primary and Secondary Education. A Systematic Review',
        authors: 'S. Masneri, A. Domínguez, M. Zorrilla, M. Larrañaga, A. Arruarte',
        venue: 'Journal of Universal Computer Science, Vol. 28(6)',
        url: 'https://doi.org/10.3897/jucs.76535',
        featured: true,
    },
    {
        year: '2022',
        title: 'A CNN-based framework for enhancing 360 VR experiences with multisensorial effects',
        authors: 'P. Szabó, A. A. Simiscuka, S. Masneri, M. Zorrilla, G.-M. Muntean',
        venue: 'IEEE Transactions on Multimedia, Vol. 25',
        url: 'https://doi.org/10.1109/TMM.2022.3157556',
    },
    {
        year: '2022',
        title: 'Experimenting with distributed participatory performing art experiences',
        authors: 'M. Zorrilla, A. Domínguez, H. Rivas, S. Masneri, S. Cabrero, A. Striner, P. Cesar',
        venue: 'IEEE Int. Symposium on Broadband Multimedia Systems and Broadcasting (BMSB 2022)',
        url: 'https://doi.org/10.1109/BMSB55706.2022.9828558',
    },
    {
        year: '2022',
        title: 'The co-creation space: Supporting asynchronous artistic co-creation dynamics',
        authors: 'A. Striner, T. Röggla, M. Zorrilla, S. Cabrero Barros, S. Masneri, H. Rivas Pagador, I. Calvis, J. Li, P. Cesar',
        venue: 'ACM CSCW 2022 (Companion)',
        url: 'https://doi.org/10.1145/3500868.3559459',
    },
    {
        year: '2022',
        title: 'Collaborative Augmented Reality Tools for Behavioral Lessons',
        authors: 'A. Domínguez, Á. Cabrero, B. Simões, G. Chiazzese, M. Farella, M. Arrigo, L. Seta, A. Chifari, C. Tosto, S. L. Goei, et al.',
        venue: 'Int. Conf. on Interactive Collaborative Learning (ICL 2022)',
        url: 'https://doi.org/10.1007/978-3-031-26876-2_10',
    },
    {
        year: '2021',
        title: 'A model for user interface adaptation of multi-device media services',
        authors: 'A. Domínguez, J. Flórez, A. Lafuente, S. Masneri, I. Tamayo, M. Zorrilla',
        venue: 'IEEE Transactions on Broadcasting, Vol. 67(3)',
        url: 'https://doi.org/10.1109/TBC.2021.3064221',
    },
    {
        year: '2021',
        title: 'Co-creation stage: a web-based tool for collaborative and participatory co-located art performances',
        authors: 'H. Rivas Pagador, A. Domínguez, S. Masneri, I. Tamayo, M. Zorrilla, P. Almeida, J. Li, A. Striner, P. Cesar',
        venue: 'ACM Int. Conf. on Interactive Media Experiences (IMX 2021)',
        url: 'https://doi.org/10.1145/3452918.3465483',
    },
    {
        year: '2021',
        title: 'Collaborative multi-user augmented reality solutions in the classroom',
        authors: 'S. Masneri, A. Domínguez, M. Sanz, I. Tamayo, M. Zorrilla, M. Larrañaga, A. Arruarte',
        venue: 'Int. Conf. on Interactive Collaborative Learning (ICL 2021)',
        url: 'https://doi.org/10.1007/978-3-030-93907-6_106',
    },
    {
        year: '2020',
        title: 'A methodology for user interface adaptation of multi-device broadcast-broadband services',
        authors: 'A. Domínguez, J. Flórez, A. Lafuente, S. Masneri, I. Tamayo, M. Zorrilla',
        venue: 'IEEE Access, Vol. 8',
        url: 'https://doi.org/10.1109/ACCESS.2020.3039616',
    },
    {
        year: '2020',
        title: 'Predictive CDN selection for video delivery based on LSTM network performance forecasts and cost-effective trade-offs',
        authors: 'R. Viola, A. Martín, J. Morgade, S. Masneri, M. Zorrilla, P. Angueira, J. Montalbán',
        venue: 'IEEE Transactions on Broadcasting, Vol. 67(1)',
        url: 'https://doi.org/10.1109/TBC.2020.3031724',
    },
    {
        year: '2020',
        title: 'Combining Video and Wireless Signals for Enhanced Audience Analysis',
        authors: 'M. Sanz-Narrillos, S. Masneri, M. Zorrilla',
        venue: 'ICAART 2020',
        url: 'https://doi.org/10.5220/0008963101510161',
    },
    {
        year: '2020',
        title: 'A multi-modal audience engagement measurement system',
        authors: 'M. Sanz-Narrillos, S. Masneri, M. Zorrilla',
        venue: 'ICAART 2020 (Springer, revised selected papers)',
        url: 'https://doi.org/10.1007/978-3-030-71158-0_17',
    },
    {
        year: '2020',
        title: 'A Novel Production Workflow and Toolset for Opera Co-creation towards Enhanced Societal Inclusion of People',
        authors: 'M. Zorrilla, S. Masneri, A. Domínguez, I. Tamayo, A. Simiscuka, T. Röggla, P. Cesar, G.-M. Muntean',
        venue: 'NEM Summit 2020',
        url: 'https://nem-initiative.org/wp-content/uploads/2020/07/2-2-nem2020_20200630.pdf?x79264',
    },
    {
        year: '2020',
        title: 'Work-in-progress — ARETE: an interactive educational system using augmented reality',
        authors: 'S. Masneri, A. Domínguez, F. Wild, J. Pronk, M. Heintz, J. Tiede, A. Nistor, G. Chiazzese, E. Mangina',
        venue: 'Int. Conf. of the Immersive Learning Research Network (iLRN 2020, IEEE)',
        url: 'https://doi.org/10.23919/iLRN47897.2020.9155186',
    },
    {
        year: '2019',
        title: 'Methods for device characterisation in media services',
        authors: 'A. Domínguez, J. Flórez, A. Lafuente, S. Masneri, I. Tamayo, M. Zorrilla',
        venue: 'ACM Int. Conf. on Interactive Experiences for TV and Online Video (TVX 2019)',
        url: 'https://doi.org/10.1145/3317697.3323440',
    },
    {
        year: '2015',
        title: 'How the doctor’s behavior influences the patient’s behaviour',
        authors: 'N. Gabor, F. Vitinius, R. Obliers, O. Schreer, S. Masneri, A. Ritter, H. Lausberg',
        venue: 'DGPM Congress 2015 (abstract)',
        url: 'https://www.jstor.org/stable/pdf/24329510.pdf',
    },
    {
        year: '2014',
        title: 'Diarizing large corpora using multi-modal speaker linking',
        authors: 'M. Ferras, S. Masneri, O. Schreer, H. Bourlard',
        venue: 'Interspeech 2014',
        url: 'https://www.isca-archive.org/interspeech_2014/ferras14_interspeech.html',
    },
    {
        year: '2014',
        title: 'SVM-based video segmentation and annotation of lectures and conferences',
        authors: 'S. Masneri, O. Schreer',
        venue: 'VISAPP 2014',
        url: 'https://ieeexplore.ieee.org/document/7294961',
    },
    {
        year: '2014',
        title: 'Coding hand movement behavior and gesture with NEUROGES supported by automatic video analysis',
        authors: 'O. Schreer, S. Masneri, H. Lausberg, H. Skomroch',
        venue: 'Measuring Behavior 2014',
        url: 'https://archive.measuringbehavior.org/mb2014/files/2014/Proceedings/Schreer,%20O.%20-%20MB2014.pdf',
    },
    {
        year: '2014',
        title: 'Automatic video analysis for annotation of human body motion in humanities research',
        authors: 'O. Schreer, S. Masneri',
        venue: 'Workshop on Multimodal Corpora (LREC 2014)',
        url: 'https://publica.fraunhofer.de/entities/publication/acc81d9b-3c4e-4019-95ed-7c037a675a10',
    },
    {
        year: '2013',
        title: 'Multi-factor segmentation for topic visualization and recommendation: the must-vis system',
        authors: 'C. A. Bhatt, A. Popescu-Belis, M. Habibi, S. Ingram, S. Masneri, F. McInnes, N. Pappas, O. Schreer',
        venue: 'ACM Multimedia 2013 (Grand Challenge)',
        url: 'https://doi.org/10.1145/2502081.2508120',
    },
    {
        year: '2012',
        title: 'AVATecH — automated annotation through audio and video analysis',
        authors: 'P. Lenkiewicz, E. Auer, O. Schreer, S. Masneri, D. Schneider, S. Tschöpel',
        venue: 'LREC 2012',
        url: 'https://aclanthology.org/L12-1137/',
    },
    {
        year: '2011',
        title: 'AVATecH: Audio/Video technology for humanities research',
        authors: 'S. Tschöpel, D. Schneider, R. Bardeli, O. Schreer, S. Masneri, P. Wittenburg, H. Sloetjes, P. Lenkiewicz, E. Auer',
        venue: 'Workshop on Language Technologies for Digital Humanities and Cultural Heritage 2011',
        url: 'https://aclanthology.org/W11-4113.pdf',
    },
    {
        year: '2011',
        title: 'A new skin colour estimation method based on change detection and cluster analysis',
        authors: 'S. Masneri, O. Schreer',
        venue: 'WIAMIS 2011',
        url: 'https://repository.tudelft.nl/file/File_08e7dfb3-7b4a-43c7-bb53-710ce99c7e56',
    },
    {
        year: '2011',
        title: 'Application of video processing methods for linguistic research',
        authors: 'P. Lenkiewicz, P. Wittenburg, B. G. Gebre, A. Lenkiewicz, O. Schreer, S. Masneri',
        venue: 'Language & Technology Conference (LTC 2011)',
        url: 'https://pure.mpg.de/rest/items/item_1239560_5/component/file_1239573/content',
    },
    {
        year: '2011',
        title: 'Application of audio and video processing methods for language research',
        authors: 'P. Lenkiewicz, P. Wittenburg, O. Schreer, S. Masneri, D. Schneider, S. Tschöpel',
        venue: 'Supporting Digital Humanities (SDH 2011)',
        url: 'https://pure.mpg.de/view/item_1239580',
    },
    {
        year: '2011',
        title: 'Application of Audio and Video Processing Methods for Language Research and Documentation: The AVATecH Project',
        authors: 'P. Lenkiewicz, S. Drude, A. Lenkiewicz, B. G. Gebre, S. Masneri, O. Schreer, J. Schwenninger, R. Bardeli',
        venue: 'Language & Technology Conference (LTC 2011, Springer)',
        url: 'https://doi.org/10.1007/978-3-319-08958-4_24',
    },
    {
        year: '2010',
        title: 'Automatic annotation of media field recordings',
        authors: 'E. Auer, P. Wittenburg, H. Sloetjes, O. Schreer, S. Masneri, D. Schneider, S. Tschöpel',
        venue: 'LaTeCH 2010 (ECAI Workshop)',
        url: 'https://publica-rest.fraunhofer.de/server/api/core/bitstreams/79f4ec6e-f9ac-43c6-b3e7-9adfb38113eb/content',
    },
    {
        year: '2010',
        title: 'ELAN as flexible annotation framework for sound and image processing detectors',
        authors: 'E. Auer, A. Russel, H. Sloetjes, P. Wittenburg, O. Schreer, S. Masneri, D. Schneider, S. Tschöpel',
        venue: 'LREC 2010',
        url: 'https://aclanthology.org/L10-1159/',
    },
    {
        year: '2010',
        title: 'Towards semi-automatic annotations for video and audio corpora',
        authors: 'S. Masneri, O. Schreer, D. Schneider, S. Tschöpel, R. Bardeli, S. Bordag, E. Auer, H. Sloetjes, P. Wittenburg',
        venue: 'LREC 2010',
        url: 'https://www.isca-archive.org/interspeech_2012/lenkiewicz12_interspeech.pdf',
    },
    {
        year: '2009',
        title: 'Enabling solutions for an efficient compression of PET-CT datasets',
        authors: 'A. Signoroni, S. Masneri, A. Riccardi, I. Castiglioni',
        venue: 'IEEE Nuclear Science Symposium / Medical Imaging Conference (NSS/MIC 2009)',
        url: 'https://doi.org/10.1109/NSSMIC.2009.5401965',
    },
    {
        year: '2008',
        title: 'Inter-modal selective 3D coding of PET-CT datasets',
        authors: 'A. Signoroni, S. Masneri, R. Leonardi, I. Castiglioni',
        venue: 'European Signal Processing Conference (EUSIPCO 2008)',
        url: 'https://ieeexplore.ieee.org/document/7080651',
    },
];
